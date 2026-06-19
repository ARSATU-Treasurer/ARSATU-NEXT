// js/scanner.js

// 👇 🌟 เอา URL ของ Google Apps Script (Auto-Registry ตัวเดียวกับเฟส 3) มาวางตรงนี้ครับ 👇
const SARABUN_API_URL = 'https://script.google.com/macros/s/AKfycbyoXeyrhWpF2W7PMq3R7P_-XzOVCgvFmt3HaQ9qhdiqRYJ72z6HLKhk8wCnuLefC906/exec';

let cropper = null;
let finalScannedBlob = null;
let userId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. เช็คสิทธิ์การเข้าใช้งาน
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = '../index.html';
        return;
    }
    userId = session.user.id;

    // 2. ดักจับการเลือกรูปจากกล้อง
    const cameraInput = document.getElementById('camera-input');
    cameraInput.addEventListener('change', handleFileSelect);

    // 3. ดักจับการกดบันทึก
    document.getElementById('scanner-form').addEventListener('submit', handleSaveDocument);
});

// ============ ระบบ Crop และสแกนภาพ ============ //

let originalFileType = '';

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    originalFileType = file.type;

    if (originalFileType === 'application/pdf') {
        // 🌟 ถ้าเป็น PDF ให้ข้ามการครอปไปเลย
        finalScannedBlob = file;
        const preview = document.getElementById('scanned-preview');
        // แสดงไอคอนจำลอง เนื่องจากเบราว์เซอร์โชว์พรีวิว PDF ในแท็ก img ไม่ได้
        preview.src = 'https://upload.wikimedia.org/wikipedia/commons/8/87/PDF_file_icon.svg'; 
        preview.classList.add('p-8', 'bg-gray-100', 'object-contain');

        document.getElementById('step-1-upload').classList.add('hidden');
        document.getElementById('step-2-crop').classList.add('hidden');
        document.getElementById('step-3-form').classList.remove('hidden');
    } else {
        // 🌟 ถ้าเป็นรูปภาพ เข้าสู่โหมดสแกนเนอร์ปกติ
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageToCrop = document.getElementById('image-to-crop');
            imageToCrop.src = e.target.result;
            imageToCrop.classList.remove('hidden');

            document.getElementById('step-1-upload').classList.add('hidden');
            document.getElementById('step-2-crop').classList.remove('hidden');

            if (cropper) cropper.destroy();
            cropper = new Cropper(imageToCrop, { viewMode: 1, autoCropArea: 0.9, background: false });
        };
        reader.readAsDataURL(file);
    }
}

function cancelCrop() {
    if (cropper) cropper.destroy();
    document.getElementById('camera-input').value = '';
    document.getElementById('step-2-crop').classList.add('hidden');
    document.getElementById('step-1-upload').classList.remove('hidden');
}

function applyCrop() {
    if (!cropper) return;

    const croppedCanvas = cropper.getCroppedCanvas({ maxWidth: 1200, maxHeight: 1200 });
    const filterCanvas = document.createElement('canvas');
    const ctx = filterCanvas.getContext('2d');
    filterCanvas.width = croppedCanvas.width;
    filterCanvas.height = croppedCanvas.height;

    // 🌟 ใส่ฟิลเตอร์สแกนเนอร์ ขาวดำ+คอนทราสต์
    ctx.filter = 'grayscale(100%) contrast(1.4)';
    ctx.drawImage(croppedCanvas, 0, 0);

    // แสดงตัวอย่างบนหน้าเว็บ
    const preview = document.getElementById('scanned-preview');
    preview.src = filterCanvas.toDataURL('image/jpeg', 0.8);
    preview.classList.remove('p-8', 'bg-gray-100', 'object-contain');

    // 🌟 แปลง Canvas เป็นไฟล์ PDF ด้วย jsPDF
    const { jsPDF } = window.jspdf;
    const orientation = filterCanvas.width > filterCanvas.height ? 'l' : 'p';
    const pdf = new jsPDF(orientation, 'px', [filterCanvas.width, filterCanvas.height]);
    pdf.addImage(filterCanvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, filterCanvas.width, filterCanvas.height);
    
    // บันทึกไฟล์ที่เตรียมอัปโหลดในรูปแบบ PDF
    finalScannedBlob = pdf.output('blob'); 

    document.getElementById('step-2-crop').classList.add('hidden');
    document.getElementById('step-3-form').classList.remove('hidden');
}

// ============ 🌟 ระบบเซฟลง Google Drive + Google Sheets ============ //

async function handleSaveDocument(e) {
    e.preventDefault();
    if (!finalScannedBlob) return Swal.fire('ข้อผิดพลาด', 'ไม่พบภาพที่สแกน', 'error');

    const btn = document.getElementById('btn-save');
    const dept = document.getElementById('doc-dept').value;
    const title = document.getElementById('doc-title').value.trim();
    const location = document.getElementById('doc-location').value.trim();

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> กำลังอัปโหลดและลงทะเบียน...';
    lucide.createIcons();

    try {
        if (!SARABUN_API_URL || SARABUN_API_URL.includes('ใส่_URL_')) throw new Error("ยังไม่ได้ใส่ URL ของ API สารบรรณ");

        // 1. อัปโหลดรูปลง Supabase Storage ก่อน เพื่อให้ได้ URL (เอาไปให้ Google ดูดต่อ)
        // อัปโหลดไฟล์ชั่วคราว (เป็น PDF)
        const tempFileName = `scans/temp_${Date.now()}.pdf`;
        const { error: uploadErr } = await supabaseClient.storage.from('receipts').upload(tempFileName, finalScannedBlob, { contentType: 'application/pdf' });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabaseClient.storage.from('receipts').getPublicUrl(tempFileName);
        const fileUrl = urlData.publicUrl;

        // 2. ส่งข้อมูลไปให้ Google Apps Script ทำงาน (เซฟรูปลง Drive + รันเลขลง Sheet)
        const response = await fetch(SARABUN_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                imageUrl: fileUrl,
                department: dept,
                docName: title,
                location: location
            }),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error);

        Swal.fire({
            icon: 'success',
            title: 'ลงทะเบียนสำเร็จ!',
            html: `รหัสเอกสาร: <b class="text-emerald-600">${result.runningNumber}</b><br>ข้อมูลถูกส่งเข้า Google Drive และ Sheets เรียบร้อยแล้ว`,
        }).then(() => {
            window.location.reload(); // รีเซ็ตหน้าเว็บเพื่อพร้อมสแกนใบต่อไป
        });

    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> บันทึกเข้าระบบทะเบียน';
        lucide.createIcons();
    }
}