// js/other-income.js
let currentUser = null;
let currentCampId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    currentUser = session.user;

    const { data: camp } = await supabaseClient.from('camps').select('id').eq('is_active', true).single();
    if (camp) {
        currentCampId = camp.id;
        fetchMyOtherHistory();
    }

    document.getElementById('form-other').addEventListener('submit', handleOtherSubmit);
});

async function handleOtherSubmit(e) {
    e.preventDefault();

    const type = document.getElementById('other-type').value;
    const amount = parseFloat(document.getElementById('other-amount').value);
    const details = document.getElementById('other-details').value;
    const date = document.getElementById('other-date').value;

    const typeLabel = type === 'other_income' ? 'รายรับเข้า (Income)' : 'รายจ่ายออก (Expense)';
    const typeColor = type === 'other_income' ? 'text-teal-600' : 'text-rose-600';
    const bgAmount = type === 'other_income' ? 'bg-teal-50 border-teal-200' : 'bg-rose-50 border-rose-200';

    // 🌟 เพิ่ม Pop-up ยืนยันการทำรายการเบ็ดเตล็ด
    const confirmResult = await Swal.fire({
        title: 'ยืนยันแจ้งรายการบัญชี?',
        icon: 'info',
        html: `
            <div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2">
                <p class="text-gray-500">ประเภท: <span class="font-bold ${typeColor}">${typeLabel}</span></p>
                <p class="text-gray-500">รายละเอียด: <span class="font-bold text-gray-800">${details}</span></p>
                <div class="${bgAmount} p-4 rounded-xl border mt-3 text-center">
                    <p class="${typeColor} font-bold text-xs mb-1">ยอดเงินทำรายการ</p>
                    <p class="text-3xl font-extrabold ${typeColor}">${amount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: type === 'other_income' ? '#0d9488' : '#e11d48',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ยืนยันส่งข้อมูล',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (!confirmResult.isConfirmed) return;

    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> กำลังส่งข้อมูล...';
    lucide.createIcons();

    try {
        const file = document.getElementById('other-slip').files[0];
        const ext = file.name.split('.').pop(); // ดึงนามสกุลไฟล์ (.jpg, .pdf)
        const filePath = `reports/others_${Date.now()}.${ext}`; // ข้ามชื่อไฟล์ไทยไปเลย
        await supabaseClient.storage.from('receipts').upload(filePath, file);
        const { data: urlData } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);

        const payload = {
            user_id: currentUser.id,
            camp_id: currentCampId,
            status: 'pending',
            request_type: type,
            total_amount: amount,
            purpose: `${type === 'other_income' ? 'รายรับอื่น':'รายจ่ายอื่น'}: ${details}`,
            remark: document.getElementById('other-remark').value,
            receipt_image_url: JSON.stringify([urlData.publicUrl]),
            created_at: new Date(date).toISOString(),
            department: 'ทั่วไป'
        };

        const { error } = await supabaseClient.from('clearances').insert([payload]);
        if (error) throw error;

        await Swal.fire('สำเร็จ', 'ส่งบันทึกรายการบัญชีให้เหรัญญิกตรวจสอบแล้ว', 'success');
        e.target.reset(); document.getElementById('other-date').value = new Date().toISOString().split('T')[0];
        fetchMyOtherHistory();
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
    finally { btn.disabled = false; btn.innerText = 'ส่งรายการบัญชี'; }
}

async function fetchMyOtherHistory() {
    const container = document.getElementById('my-other-history');
    const { data: items } = await supabaseClient.from('clearances').select('*').eq('user_id', currentUser.id).in('request_type', ['other_income', 'other_expense']).order('created_at', { ascending: false });

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4 text-xs">ยังไม่มีประวัติรายการเบ็ดเตล็ด</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const isInc = item.request_type === 'other_income';
        return `
            <div class="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                <div>
                    <p class="text-xs font-bold text-gray-800">${item.purpose}</p>
                    <p class="text-[10px] text-gray-400">${new Date(item.created_at).toLocaleDateString('th-TH')}</p>
                </div>
                <div class="text-right">
                    <p class="text-sm font-bold ${isInc ? 'text-teal-600':'text-red-500'}">${isInc ? '+':'-'}${parseFloat(item.total_amount).toLocaleString()} ฿</p>
                    <span class="text-[9px] px-1.5 py-0.5 rounded-full ${item.status === 'cleared' ? 'bg-green-100 text-green-700':'bg-orange-100 text-orange-700'}">${item.status === 'cleared' ? 'อนุมัติแล้ว':'รอตรวจสอบ'}</span>
                </div>
            </div>`;
    }).join('');
}

function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; 
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (profile && profile.role === 'admin') {
        const adminLink = document.getElementById('admin-action-link');
        if (adminLink) adminLink.classList.remove('hidden');
    }
});