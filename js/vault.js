// js/vault.js

// 👇 🌟 เอา URL ของเว็บแอป (Google Apps Script) ที่เพิ่งได้มา วางตรงนี้ครับ 👇
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwnhiTo8wharGgHOgyZ5rPjsQ-72gpZQJh92d0pNfNTMSMxxe1nk6W4kBbSgwNK6nMN/exec';

let cropper = null;
let finalScannedBase64 = null; // เปลี่ยนมาเก็บ Base64 แทน Blob เพื่อส่งให้ Google Drive
let userId = null;
let userFullName = 'สมาชิกทั่วไป';

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = '../index.html'; return; }
    userId = session.user.id;

    // ดึงชื่อสมาชิกเพื่อเอาไปสร้างเป็นชื่อโฟลเดอร์ใน Google Drive
    const { data: profile } = await supabaseClient.from('profiles').select('full_name').eq('id', userId).single();
    if(profile && profile.full_name) userFullName = profile.full_name;

    loadVaultItems();

    document.getElementById('camera-input').addEventListener('change', handleFileSelect);
    document.getElementById('vault-form').addEventListener('submit', handleSaveToVault);
    
    // ทริคเปิดกล้องอัตโนมัติจาก LINE OA
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('scan') === 'true') {
        document.getElementById('camera-input').click();
    }
});

async function loadVaultItems() {
    const container = document.getElementById('vault-items');
    const { data, error } = await supabaseClient.from('member_vault').select('*').order('created_at', { ascending: false });
    
    if (error || !data || data.length === 0) {
        container.innerHTML = '<div class="col-span-2 text-center py-8 text-gray-400 text-xs bg-gray-50 rounded-2xl border border-dashed border-gray-200">ยังไม่มีเอกสารในคลังส่วนตัว</div>';
        return;
    }

    container.innerHTML = data.map(doc => `
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative group">
            <img src="${doc.file_url}" class="w-full h-32 object-cover">
            <div class="p-2">
                <p class="text-xs font-bold text-gray-800 truncate">${doc.title}</p>
                <p class="text-[9px] text-gray-400">${new Date(doc.created_at).toLocaleDateString('th-TH')}</p>
            </div>
            <button onclick="deleteVaultItem('${doc.id}')" class="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-lg shadow-sm opacity-80 hover:opacity-100"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('image-to-crop');
        img.src = e.target.result;
        img.classList.remove('hidden');

        document.getElementById('vault-list-view').classList.add('hidden');
        document.getElementById('crop-view').classList.remove('hidden');

        if (cropper) cropper.destroy();
        cropper = new Cropper(img, { viewMode: 1, autoCropArea: 0.9, background: false });
    };
    reader.readAsDataURL(file);
}

function cancelCrop() {
    if (cropper) cropper.destroy();
    document.getElementById('camera-input').value = '';
    document.getElementById('crop-view').classList.add('hidden');
    document.getElementById('vault-list-view').classList.remove('hidden');
}

function applyCrop() {
    if (!cropper) return;
    // บีบอัดภาพไม่ให้เกิน 1000px เพื่อให้ Google Drive ทำงานไว
    const canvas = cropper.getCroppedCanvas({ maxWidth: 1000, maxHeight: 1000 });
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    document.getElementById('scanned-preview').src = dataUrl;
    
    // ตัดเอาเฉพาะเนื้อหา Base64 (เอา data:image/jpeg;base64, ออก)
    finalScannedBase64 = dataUrl.split(',')[1];

    document.getElementById('crop-view').classList.add('hidden');
    document.getElementById('save-view').classList.remove('hidden');
}

async function handleSaveToVault(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save');
    const title = document.getElementById('doc-title').value.trim();
    
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> กำลังอัปโหลดลง Google Drive...';

    try {
        if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes('ใส่_URL_')) throw new Error("ยังไม่ได้ใส่ URL ของ Google Apps Script");

        // 🌟 1. ส่งรูปไปเซฟที่ Google Drive ผ่าน API
        const driveResponse = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                base64: finalScannedBase64,
                fileName: `Vault_${Date.now()}.jpg`,
                userName: userFullName // ส่งชื่อคนไปสร้างโฟลเดอร์
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' } // ป้องกันปัญหา CORS
        });

        const driveData = await driveResponse.json();
        if (!driveData.success) throw new Error(driveData.error);

        btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> กำลังล็อกเข้าคลัง...';

        // 🌟 2. เอาลิงก์ Google Drive มาบันทึกเก็บไว้ในระบบ Supabase ของเรา
        const { error: dbErr } = await supabaseClient.from('member_vault').insert([{ 
            user_id: userId, 
            title: title, 
            file_url: driveData.url 
        }]);
        
        if (dbErr) throw dbErr;

        Swal.fire('สำเร็จ!', 'เก็บเอกสารเข้าคลังส่วนตัวใน Drive เรียบร้อยแล้ว', 'success').then(() => {
            window.location.reload();
        });
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="lock" class="w-5 h-5"></i> ล็อกเก็บเข้าคลัง';
    }
}

window.deleteVaultItem = async function(id) {
    if(!confirm('ลบเอกสารนี้ออกจากคลัง? (หมายเหตุ: ไฟล์ต้นฉบับใน Drive จะยังคงอยู่)')) return;
    await supabaseClient.from('member_vault').delete().eq('id', id);
    loadVaultItems();
}