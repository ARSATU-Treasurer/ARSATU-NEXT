// js/history.js

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    currentUser = session.user;

    fetchMyHistory();
});

async function fetchMyHistory() {
    const container = document.getElementById('history-container');
    container.innerHTML = '<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2"></i><p class="text-sm">กำลังโหลดประวัติของคุณ...</p></div>';
    lucide.createIcons();

    try {
        const { data: clearances, error } = await supabaseClient
            .from('clearances')
            .select('*, camps(name)')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!clearances || clearances.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 bg-white/60 backdrop-blur-sm rounded-2xl border border-dashed border-gray-300">
                    <i data-lucide="inbox" class="w-12 h-12 text-gray-300 mx-auto mb-3"></i>
                    <p class="text-gray-500 font-medium">ยังไม่มีประวัติการเบิกเงิน</p>
                    <a href="clearances.html" class="inline-block mt-3 text-xs bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold">สร้างคำขอเบิกเงินเลย</a>
                </div>`;
            lucide.createIcons();
            return;
        }

        renderHistory(clearances);

    } catch (err) {
        console.error("Fetch Error:", err);
        container.innerHTML = `<p class="text-red-500 text-center">เกิดข้อผิดพลาด: ${err.message}</p>`;
    }
}

function renderHistory(clearances) {
    const container = document.getElementById('history-container');
    container.innerHTML = '';

    clearances.forEach(item => {
        // ค่า Default เริ่มต้น (สำหรับ pending)
        let statusConfig = { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100', icon: 'clock', label: 'รอตรวจสอบ' };
        
        if (item.status === 'draft') statusConfig = { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: 'edit-3', label: 'แบบร่าง' };
        
        if (item.status === 'approved') {
            if (item.request_type === 'advance') {
                statusConfig = { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', icon: 'send', label: 'รอเคลียร์บิล' };
            } else {
                statusConfig = { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100', icon: 'check-circle', label: 'อนุมัติแล้ว' };
            }
        }
        
        if (item.status === 'pending_clearance') statusConfig = { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-100', icon: 'calculator', label: 'รอตรวจเคลียร์บิล' };
        if (item.status === 'advance_transferred') statusConfig = { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100', icon: 'alert-circle', label: 'ตีกลับให้แก้บิล' };
        
        if (item.status === 'cleared') statusConfig = { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', icon: 'check-check', label: 'เคลียร์บิลแล้ว' };
        if (item.status === 'rejected') statusConfig = { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100', icon: 'x-circle', label: 'ถูกตีกลับ' };

        const typeLabel = item.request_type === 'advance' ? 'ยืมทดรอง' : 'เบิกเงินคืน';
        const date = new Date(item.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
        const amount = parseFloat(item.total_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 });

        // สร้างปุ่ม Action แบบ Dynamic
        let actionButton = '';
        if (item.status === 'draft') {
            actionButton = `<a href="clearances.html?id=${item.id}" onclick="event.stopPropagation()" class="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200 relative z-10">✏️ แก้ไขร่าง</a>`;
        } 
        else if (item.status === 'pending') {
            actionButton = `<button onclick="recallRequest('${item.id}', event)" class="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg font-bold hover:bg-gray-200 relative z-10 flex items-center gap-1 shadow-sm"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> ดึงกลับมาแก้ไข</button>`;
        }
        // 🌟 เพิ่มปุ่ม: แก้ไขคำขอเบิกตั้งต้น (ที่โดนตีกลับ)
        else if (item.status === 'rejected') {
            actionButton = `<a href="clearances.html?id=${item.id}" onclick="event.stopPropagation()" class="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm hover:bg-red-600 relative z-10">✏️ แก้ไขคำขอ</a>`;
        } 
        // 🌟 เพิ่มปุ่ม: แก้ไขบิลเคลียร์ (ที่โดนตีกลับ)
        else if (item.status === 'advance_transferred') {
            actionButton = `<a href="clear-bill.html?id=${item.id}" onclick="event.stopPropagation()" class="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm hover:bg-red-600 relative z-10">✏️ แก้บิลใหม่</a>`;
        } 
        else if (item.status === 'approved' && item.request_type === 'advance') {
            actionButton = `<a href="clear-bill.html?id=${item.id}" onclick="event.stopPropagation()" class="text-xs bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-bold shadow-sm hover:bg-emerald-600 relative z-10">💸 เคลียร์บิล</a>`;
        } 
        else if (item.status === 'cleared') {
            actionButton = `<span class="text-xs text-emerald-600 font-bold"><i data-lucide="check-circle" class="w-3 h-3 inline"></i> สำเร็จ</span>`;
        }

        const cardHTML = `
            <div class="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden cursor-pointer hover:shadow-md transition-all" onclick="viewDetails('${item.id}')">
                <div class="absolute top-4 right-4 flex items-center gap-1 ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border} px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm">
                    <i data-lucide="${statusConfig.icon}" class="w-3 h-3"></i> ${statusConfig.label}
                </div>
                
                <div class="pr-24">
                    <div class="flex items-center gap-2 mb-1.5">
                        <span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${typeLabel}</span>
                        <span class="text-[10px] text-gray-400">${date}</span>
                    </div>
                    <h3 class="font-bold text-gray-800 text-sm truncate">${item.purpose}</h3>
                    <p class="text-xs text-gray-500 mt-1 truncate">โครงการ: ${item.camps.name}</p>
                </div>
                
                <div class="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                    ${actionButton ? actionButton : `<span class="text-[11px] text-gray-400 font-medium hover:text-blue-500">กดเพื่อดูรายละเอียด</span>`}
                    <span class="text-lg font-extrabold text-gray-800">${amount} ฿</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHTML);
    });
    lucide.createIcons();
}

// ระบบดูรายละเอียด (Modal) สำหรับ Member
async function viewDetails(clearanceId) {
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="flex justify-center items-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 animate-spin"></i></div>';
    lucide.createIcons();

    try {
        const { data: clearance } = await supabaseClient.from('clearances').select('*, camps(name)').eq('id', clearanceId).single();
        const { data: items } = await supabaseClient.from('clearance_items').select('*').eq('clearance_id', clearanceId);

        let statusHTML = '';
        if (clearance.status === 'draft') statusHTML = '<span class="text-gray-600 bg-gray-50 px-2 py-1 rounded text-xs font-bold border border-gray-200">แบบร่าง (ยังไม่ได้ส่ง)</span>';
        if (clearance.status === 'pending') statusHTML = '<span class="text-orange-600 bg-orange-50 px-2 py-1 rounded text-xs font-bold border border-orange-100">รอการตรวจสอบจากเหรัญญิก</span>';
        
        if (clearance.status === 'approved') {
            if (clearance.request_type === 'advance') {
                statusHTML = '<span class="text-blue-600 bg-blue-50 px-2 py-1 rounded text-xs font-bold border border-blue-100">โอนเงินทดรองแล้ว (รอคุณเคลียร์บิล)</span>';
            } else {
                statusHTML = '<span class="text-green-600 bg-green-50 px-2 py-1 rounded text-xs font-bold border border-green-100">อนุมัติเรียบร้อยแล้ว</span>';
            }
        }
        if (clearance.status === 'pending_clearance') statusHTML = '<span class="text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-xs font-bold border border-yellow-100">รอแอดมินตรวจกระทบยอด</span>';
        if (clearance.status === 'cleared') statusHTML = '<span class="text-emerald-600 bg-emerald-50 px-2 py-1 rounded text-xs font-bold border border-emerald-100">เคลียร์บิลเสร็จสมบูรณ์</span>';
        if (clearance.status === 'rejected') statusHTML = '<span class="text-red-600 bg-red-50 px-2 py-1 rounded text-xs font-bold border border-red-100">รายการถูกตีกลับ (โปรดติดต่อเหรัญญิก)</span>';

        // 🛠️ แก้ไขปัญหาที่ 2: ระบบจัดการการแสดงผลหลายรูปภาพแบบป้องกัน Error
        let evidenceHTML = '';
        let receiptFiles = [];

        if (clearance.receipt_image_url) {
            try {
                const parsed = JSON.parse(clearance.receipt_image_url);
                if (Array.isArray(parsed)) receiptFiles = parsed;
                else receiptFiles = [clearance.receipt_image_url];
            } catch (e) {
                receiptFiles = [clearance.receipt_image_url];
            }
        }
        
        if (receiptFiles.length > 0) {
            evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">ใบเสนอราคา / ใบเสร็จ (ผู้ขอเบิก)</p><div class="grid grid-cols-2 gap-2">`;
            evidenceHTML += receiptFiles.map(url => url.toLowerCase().includes('.pdf') 
                ? `<a href="${url}" target="_blank" class="p-2 bg-red-50 text-red-600 rounded text-[10px] font-bold border border-red-100 text-center flex flex-col items-center justify-center"><i data-lucide="file-text" class="w-4 h-4 mb-1"></i> ดู PDF</a>` 
                : `<a href="${url}" target="_blank" class="block rounded border border-gray-200 overflow-hidden"><img src="${url}" class="w-full h-24 object-cover"></a>`
            ).join('');
            evidenceHTML += `</div></div>`;
        }

        if (clearance.advance_slip_url) evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-blue-500 mb-1 uppercase tracking-wider">สลิปโอนเงินทดรองจ่าย (เหรัญญิก)</p><a href="${clearance.advance_slip_url}" target="_blank" class="block w-1/2 rounded border border-blue-200 overflow-hidden shadow-sm"><img src="${clearance.advance_slip_url}" class="w-full h-24 object-cover"></a></div>`;
        if (clearance.refund_slip_url) evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-green-500 mb-1 uppercase tracking-wider">สลิปคืนเงินทอนชุมนุม (ผู้ขอเบิก)</p><a href="${clearance.refund_slip_url}" target="_blank" class="block w-1/2 rounded border border-green-200 overflow-hidden shadow-sm"><img src="${clearance.refund_slip_url}" class="w-full h-24 object-cover"></a></div>`;
        if (clearance.reimburse_slip_url) evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-purple-500 mb-1 uppercase tracking-wider">สลิปโอนเงินชดเชย (เหรัญญิก)</p><a href="${clearance.reimburse_slip_url}" target="_blank" class="block w-1/2 rounded border border-purple-200 overflow-hidden shadow-sm"><img src="${clearance.reimburse_slip_url}" class="w-full h-24 object-cover"></a></div>`;

        const itemsHTML = items.map((item, i) => `
            <div class="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                <span class="text-gray-700 text-xs">${i + 1}. ${item.description} (x${item.quantity})</span>
                <span class="font-bold text-gray-800 text-xs">${parseFloat(item.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</span>
            </div>
        `).join('');

        // 🌟 สร้าง HTML กล่องแจ้งเตือนเหตุผลที่ตีกลับ
        let reasonHTML = '';
        if (clearance.reject_reason && (clearance.status === 'rejected' || clearance.status === 'advance_transferred')) {
            reasonHTML = `
                <div class="bg-red-50 border border-red-200 p-3 rounded-xl mb-4 shadow-sm">
                    <p class="text-red-600 text-xs font-bold"><i data-lucide="alert-circle" class="w-4 h-4 inline mb-0.5"></i> แอดมินตีกลับ: ${clearance.reject_reason}</p>
                </div>`;
        }

        // นำตัวแปร ${reasonHTML} ไปแทรกไว้ใต้ ${statusHTML}
        content.innerHTML = `
            <div class="mb-4 text-center">${statusHTML}</div>
            ${reasonHTML}
            <div class="space-y-2 border-b border-gray-100 pb-4">
                <p class="text-xs text-gray-500">หัวข้อ: <span class="font-bold text-gray-800 text-sm">${clearance.purpose}</span></p>
                <p class="text-xs text-gray-500">โครงการ: <span class="font-bold text-gray-800">${clearance.camps.name}</span></p>
            </div>
            <div>
                <p class="text-xs font-bold text-gray-700 mb-2 bg-gray-100 p-2 rounded-lg">รายการสินค้า</p>
                <div class="px-2">${itemsHTML}</div>
                <div class="flex justify-between items-center mt-3 pt-3 border-t-2 border-dashed border-gray-200 px-2">
                    <span class="font-bold text-gray-600 text-xs">ยอดขอเบิก</span>
                    <span class="font-extrabold text-blue-600 text-lg">${parseFloat(clearance.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</span>
                </div>
            </div>
            <div class="pt-2 mt-4 border-t border-gray-100">
                <p class="text-xs font-bold text-gray-700 mb-2 mt-2">ไฟล์แนบ / หลักฐานอ้างอิง</p>
                ${evidenceHTML || '<p class="text-xs text-gray-400">ไม่มีหลักฐานแนบ</p>'}
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<p class="text-red-500 text-center py-5">เกิดข้อผิดพลาด: ${err.message}</p>`;
    }
}

function closeModal() {
    document.getElementById('details-modal').classList.add('hidden');
}

document.getElementById('details-modal').addEventListener('click', (e) => {
    if (e.target.id === 'details-modal') closeModal();
});




// 1. ฟังก์ชันเปิดปิดเมนู (เอาไว้ล่างสุดของไฟล์ JS)
function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

// 2. เช็คว่าเป็นแอดมินหรือเปล่า (เอาไปแทรกไว้ในฟังก์ชันที่ดึง session/profile ตอนเปิดหน้าเว็บ)
// ตัวอย่างเช่น ใน document.addEventListener('DOMContentLoaded', ...)
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; // หรือ redirect ไปหน้าล็อกอิน
    
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    
    // 🌟 ถ้าเป็น Admin ให้ลบคลาส hidden ออกจากปุ่ม
    if (profile && profile.role === 'admin') {
        const adminLink = document.getElementById('admin-action-link');
        if (adminLink) {
            adminLink.classList.remove('hidden');
        }
    }
});

// ================= ฟังก์ชันสำหรับแก้ปัญหา Human Error ================= //
window.recallRequest = async function(clearanceId, event) {
    // ป้องกันไม่ให้คลิกแล้วเด้งเปิดหน้าต่างรายละเอียด
    if (event) event.stopPropagation();
    
    // ถามเพื่อความแน่ใจก่อนดึงกลับ
    const confirmResult = await Swal.fire({
        title: 'ดึงคำขอกลับ?',
        text: "คำขอนี้จะถูกดึงกลับมาเป็น 'ฉบับร่าง' เพื่อให้คุณแก้ไขข้อมูลและกดส่งใหม่ได้",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ดึงกลับมาแก้ไข',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (!confirmResult.isConfirmed) return;

    Swal.fire({ title: 'กำลังดึงข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
        // อัปเดตสถานะใน Supabase กลับเป็น draft
        const { error } = await supabaseClient
            .from('clearances')
            .update({ status: 'draft' })
            .eq('id', clearanceId);

        if (error) throw error;
        
        await Swal.fire('สำเร็จ!', 'ดึงคำขอกลับมาเป็นฉบับร่างแล้ว คุณสามารถกดแก้ไขได้เลย', 'success');
        window.location.reload(); // โหลดหน้าเว็บใหม่เพื่ออัปเดตปุ่ม
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}