// js/clear-bill.js

let clearanceId = new URLSearchParams(window.location.search).get('id');
let advanceAmount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    if (!clearanceId) return window.location.href = 'history.html';
    
    const { data: clearance } = await supabaseClient.from('clearances').select('*, camps(name)').eq('id', clearanceId).single();
    if (!clearance) {
        await Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลบิลนี้', 'error');
        return window.location.href = 'history.html';
    }

    advanceAmount = parseFloat(clearance.total_amount);
    document.getElementById('display-purpose').innerText = clearance.purpose;
    document.getElementById('advance-amount').innerText = advanceAmount.toLocaleString('th-TH', {minimumFractionDigits: 2});

    if (clearance.reject_reason && clearance.status === 'advance_transferred') {
        document.getElementById('display-purpose').insertAdjacentHTML('afterend', `
            <div class="bg-red-50 border border-red-200 p-3 rounded-xl mt-3 shadow-sm">
                <p class="text-red-600 text-xs font-bold"><i data-lucide="alert-circle" class="w-4 h-4 inline mb-0.5"></i> แอดมินตีกลับ: ${clearance.reject_reason}</p>
            </div>
        `);
    }

    const { data: items } = await supabaseClient.from('clearance_items').select('*').eq('clearance_id', clearanceId);
    renderItems(items || []); setupDynamicItems();
});

function renderItems(items) {
    const container = document.getElementById('items-container');
    container.innerHTML = '';
    if (items.length === 0) container.insertAdjacentHTML('beforeend', createItemRow(1));
    else items.forEach((item, index) => { container.insertAdjacentHTML('beforeend', createItemRow(index + 1, item.description, item.quantity, item.amount)); });
    lucide.createIcons(); updateItemsState(); calculateTotalAmount(); 
}

function createItemRow(index, desc = '', qty = 1, amount = '') {
    return `
    <div class="item-row bg-gray-50 border border-gray-100 rounded-xl p-4 relative group mt-4">
        <div class="flex justify-between items-center mb-3">
            <span class="text-[11px] font-bold text-gray-400 bg-white px-2.5 py-1 rounded border item-number">รายการที่ ${index}</span>
            <button type="button" class="btn-remove-item text-gray-400 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <div class="space-y-2">
            <input type="text" placeholder="ชื่อรายการ..." value="${desc}" required class="item-desc w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
            <div class="grid grid-cols-3 gap-2">
                <input type="number" placeholder="1" value="${qty}" min="0.01" step="0.01" required class="item-qty w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-center col-span-1">
                <input type="number" placeholder="ราคารวม" value="${amount}" step="0.01" min="0.01" required class="item-amount w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right font-bold text-blue-700 col-span-2">
            </div>
        </div>
    </div>`;
}

function updateItemsState() {
    const rows = document.querySelectorAll('.item-row');
    rows.forEach((row, index) => {
        row.querySelector('.item-number').innerText = `รายการที่ ${index + 1}`;
        const btnRemove = row.querySelector('.btn-remove-item');
        if(rows.length === 1) { btnRemove.disabled = true; btnRemove.classList.add('opacity-0'); } 
        else { btnRemove.disabled = false; btnRemove.classList.remove('opacity-0'); }
    });
}

function setupDynamicItems() {
    const container = document.getElementById('items-container');
    const btnAdd = document.getElementById('btn-add-item');

    btnAdd.addEventListener('click', () => {
        const rowCount = container.querySelectorAll('.item-row').length;
        container.insertAdjacentHTML('beforeend', createItemRow(rowCount + 1));
        lucide.createIcons(); updateItemsState();
    });

    container.addEventListener('input', (e) => { if (e.target.classList.contains('item-amount')) calculateTotalAmount(); });
    container.addEventListener('click', (e) => {
        const btnRemove = e.target.closest('.btn-remove-item');
        if (btnRemove && !btnRemove.disabled) { btnRemove.closest('.item-row').remove(); updateItemsState(); calculateTotalAmount(); }
    });
}

function calculateTotalAmount() {
    let actualTotal = 0;
    document.querySelectorAll('.item-amount').forEach(input => { actualTotal += parseFloat(input.value) || 0; });
    document.getElementById('actual-amount-display').innerText = actualTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 });
    document.getElementById('actual-amount').value = actualTotal;
    calculateDifference(advanceAmount, actualTotal);
}

function calculateDifference(advance, actual) {
    const diff = advance - actual;
    const container = document.getElementById('diff-result');
    const actionBtn = document.getElementById('btn-submit-clear');

    if (diff > 0) {
        container.innerHTML = `
            <div class="bg-red-50 p-4 rounded-xl border border-red-200 mt-2">
                <p class="text-red-700 font-bold text-sm">คุณต้องโอนคืน: ${diff.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                <label class="block text-xs font-bold mt-3 mb-1">แนบสลิปโอนเงินคืนชุมนุม <span class="text-red-500">*</span></label>
                <input type="file" id="refund-slip" accept="image/*,application/pdf" class="w-full text-xs p-1 bg-white border border-red-100 rounded-lg cursor-pointer" required>
            </div>`;
    } else if (diff < 0) {
        container.innerHTML = `
            <div class="bg-green-50 p-4 rounded-xl border border-green-200 mt-2">
                <p class="text-green-700 font-bold text-sm">ชุมนุมต้องโอนคืนคุณ: ${Math.abs(diff).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
            </div>`;
    } else {
        container.innerHTML = `<div class="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-2"><p class="text-gray-600 font-bold text-sm text-center">ยอดใช้จ่ายพอดีกับที่เบิก</p></div>`;
    }
    
    if (actual > 0) actionBtn.classList.remove('hidden'); else actionBtn.classList.add('hidden');
}

async function submitClearance() {
    const actualAmount = parseFloat(document.getElementById('actual-amount').value);
    const refundSlip = document.getElementById('refund-slip')?.files[0];
    const receiptFiles = document.getElementById('receipt-files')?.files; // 🌟 รับค่าไฟล์ใบเสร็จ (หลายไฟล์)
    const diff = advanceAmount - actualAmount;

    // บังคับแนบสลิปคืนเงิน (กรณีเงินเหลือ)
    if (diff > 0 && !refundSlip) return Swal.fire('แจ้งเตือน', 'กรุณาแนบสลิปการโอนเงินคืนชุมนุม', 'warning');

    // 🌟 บังคับแนบใบเสร็จอย่างน้อย 1 รูป
    if (!receiptFiles || receiptFiles.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาแนบรูปใบเสร็จรับเงิน/สลิป อย่างน้อย 1 รูป', 'warning');
    }

    const newItems = [];
    document.querySelectorAll('.item-row').forEach(row => {
        const desc = row.querySelector('.item-desc').value;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 1;
        const amt = parseFloat(row.querySelector('.item-amount').value) || 0;
        if (desc && amt > 0) newItems.push({ clearance_id: clearanceId, description: desc, quantity: qty, amount: amt });
    });

    if (newItems.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาระบุรายการที่ใช้จ่ายจริงอย่างน้อย 1 รายการ', 'warning');

    let diffMsgHTML = '';
    if (diff > 0) {
        diffMsgHTML = `<p class="text-red-600 font-bold mt-2">คุณต้องโอนคืนชุมนุม: ${diff.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                       <p class="text-[10px] text-gray-500">*แนบสลิปคืนเงินแล้ว</p>`;
    } else if (diff < 0) {
        diffMsgHTML = `<p class="text-green-600 font-bold mt-2">ชุมนุมต้องโอนชดเชยคุณ: ${Math.abs(diff).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                       <p class="text-[10px] text-gray-500">*รอรับเงินหลังแอดมินตรวจสอบ</p>`;
    } else {
        diffMsgHTML = `<p class="text-blue-600 font-bold mt-2">ยอดใช้จ่ายพอดีกับที่เบิก (ไม่ต้องโอนเพิ่ม/คืน)</p>`;
    }

    const confirmResult = await Swal.fire({
        title: 'ยืนยันการส่งเคลียร์บิล?',
        icon: 'info',
        html: `
            <div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2">
                <div class="flex justify-between items-center text-gray-600">
                    <span>ยอดที่เบิกไป:</span><span class="font-bold">${advanceAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</span>
                </div>
                <div class="flex justify-between items-center text-gray-800">
                    <span>รวมจ่ายจริงทั้งหมด:</span><span class="font-bold text-lg">${actualAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</span>
                </div>
                <div class="bg-gray-50 p-3 rounded-xl border border-gray-200 mt-3 text-center shadow-inner">
                    ${diffMsgHTML}
                </div>
                <p class="text-center text-emerald-600 text-xs font-bold mt-2"><i data-lucide="file-check-2" class="w-3.5 h-3.5 inline"></i> แนบใบเสร็จแล้ว ${receiptFiles.length} รูป</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ส่งเคลียร์บิล',
        cancelButtonText: 'แก้ไข',
        reverseButtons: true,
        didOpen: () => { if (typeof lucide !== 'undefined') lucide.createIcons(); }
    });

    if (!confirmResult.isConfirmed) return;

    const btnSubmit = document.getElementById('btn-submit-clear');
    btnSubmit.disabled = true; btnSubmit.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline mb-0.5"></i> กำลังอัปโหลด...';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        let refundUrl = null;
        if (refundSlip) {
            const ext1 = refundSlip.name.split('.').pop();
            const filePath = `refunds/${clearanceId}/${Date.now()}_refund.${ext1}`;
            const { error: uploadErr } = await supabaseClient.storage.from('receipts').upload(filePath, refundSlip);
            if (uploadErr) throw uploadErr;
            refundUrl = supabaseClient.storage.from('receipts').getPublicUrl(filePath).data.publicUrl;
        }

        let receiptUrls = [];
        for (let i = 0; i < receiptFiles.length; i++) {
            const file = receiptFiles[i];
            const ext2 = file.name.split('.').pop();
            const filePath = `receipts/${clearanceId}/items_${Date.now()}_${i}.${ext2}`;
            const { error: uploadErr } = await supabaseClient.storage.from('receipts').upload(filePath, file);
            if (uploadErr) throw uploadErr;
            receiptUrls.push(supabaseClient.storage.from('receipts').getPublicUrl(filePath).data.publicUrl);
        }

        const { error: updateErr } = await supabaseClient.from('clearances').update({ 
            status: 'pending_clearance', 
            actual_amount: actualAmount, 
            refund_slip_url: refundUrl,
            receipt_image_url: JSON.stringify(receiptUrls),
            reject_reason: null
        }).eq('id', clearanceId);
        if (updateErr) throw updateErr;

        await supabaseClient.from('clearance_items').delete().eq('clearance_id', clearanceId);
        const { error: insertErr } = await supabaseClient.from('clearance_items').insert(newItems);
        if (insertErr) throw insertErr;

        await Swal.fire('สำเร็จ', 'เคลียร์บิลและแนบใบเสร็จเรียบร้อยแล้ว', 'success');
        window.location.href = 'history.html';
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
        btnSubmit.disabled = false; btnSubmit.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5 inline mb-0.5"></i> ยืนยันการเคลียร์บิล';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}