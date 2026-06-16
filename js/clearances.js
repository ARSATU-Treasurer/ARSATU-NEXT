// js/clearances.js

let currentUser = null;
let profileData = null;
let draftId = new URLSearchParams(window.location.search).get('id');

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    currentUser = session.user;

    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (!profile || !profile.full_name || !profile.default_department) {
        await Swal.fire('แจ้งเตือน', 'กรุณาตั้งค่า "ชื่อ" และ "ฝ่าย" ให้เรียบร้อยก่อนทำรายการเบิกจ่าย', 'warning');
        return window.location.href = 'settings.html';
    }
    profileData = profile;

    const deptSelect = document.getElementById('department-select');
    if (profile.default_department) deptSelect.value = profile.default_department;

    await loadCamps();
    setupDynamicItems();
    setupBankOptions();

    if (draftId) await loadDraftData(draftId);
});

async function loadCamps() {
    const selectEl = document.getElementById('camp-select');
    const { data: camps } = await supabaseClient.from('camps').select('id, name, is_active').order('created_at', { ascending: false });
    if (camps) {
        selectEl.innerHTML = '<option value="" disabled selected>-- เลือกโครงการ --</option>';
        camps.forEach(camp => {
            const option = document.createElement('option');
            option.value = camp.id; option.innerText = camp.name + (camp.is_active ? ' (กำลังดำเนินการ)' : '');
            if (camp.is_active) option.selected = true;
            selectEl.appendChild(option);
        });
    }
}

async function loadDraftData(id) {
    try {
        const { data: clearance } = await supabaseClient.from('clearances').select('*').eq('id', id).single();
        if (!clearance) return;

        document.getElementById('camp-select').value = clearance.camp_id;
        document.getElementById('department-select').value = clearance.department;
        document.getElementById('purpose').value = clearance.purpose;
        document.getElementById('remark').value = clearance.remark || '';
        
        const typeRadio = document.querySelector(`input[name="request_type"][value="${clearance.request_type}"]`);
        if (typeRadio) typeRadio.checked = true;

        const { data: items } = await supabaseClient.from('clearance_items').select('*').eq('clearance_id', id);
        if (items && items.length > 0) {
            const container = document.getElementById('items-container');
            container.innerHTML = '';
            items.forEach((item, index) => {
                const rowHTML = `
                    <div class="item-row bg-gray-50 border border-gray-100 rounded-xl p-4 relative group mt-4">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-[11px] font-bold text-gray-400 bg-white px-2.5 py-1 rounded border item-number">รายการที่ ${index + 1}</span>
                            <button type="button" class="btn-remove-item text-gray-400 hover:text-red-500 transition-colors ${items.length === 1 ? 'disabled:opacity-0' : ''}" ${items.length === 1 ? 'disabled' : ''}><i data-lucide="x" class="w-4 h-4"></i></button>
                        </div>
                        <div class="space-y-2">
                            <input type="text" value="${item.description}" required class="item-desc w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                            <div class="grid grid-cols-3 gap-2">
                                <input type="number" value="${item.quantity}" min="0.01" step="0.01" required class="item-qty w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-center col-span-1">
                                <input type="number" value="${item.amount}" step="0.01" min="0.01" required class="item-amount w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-right font-bold text-blue-700 col-span-2">
                            </div>
                        </div>
                    </div>`;
                container.insertAdjacentHTML('beforeend', rowHTML);
            });
            lucide.createIcons(); calculateTotalAmount();
        }
    } catch (err) { console.error(err); }
}

function calculateTotalAmount() {
    let total = 0;
    document.querySelectorAll('.item-amount').forEach(input => { total += parseFloat(input.value) || 0; });
    document.getElementById('total-amount').innerText = total.toLocaleString('th-TH', { minimumFractionDigits: 2 });
}

function setupDynamicItems() {
    const container = document.getElementById('items-container');
    const btnAdd = document.getElementById('btn-add-item');

    function updateItemsState() {
        const rows = container.querySelectorAll('.item-row');
        rows.forEach((row, index) => {
            row.querySelector('.item-number').innerText = `รายการที่ ${index + 1}`;
            const btnRemove = row.querySelector('.btn-remove-item');
            if(rows.length === 1) { btnRemove.disabled = true; btnRemove.classList.add('opacity-0'); } 
            else { btnRemove.disabled = false; btnRemove.classList.remove('opacity-0'); }
        });
    }

    btnAdd.addEventListener('click', () => {
        const rowHTML = `
            <div class="item-row bg-gray-50 border border-gray-100 rounded-xl p-4 relative group mt-4">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-[11px] font-bold text-gray-400 bg-white px-2.5 py-1 rounded border item-number">รายการที่ X</span>
                    <button type="button" class="btn-remove-item text-gray-400 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
                <div class="space-y-2">
                    <input type="text" placeholder="ชื่อรายการ..." required class="item-desc w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    <div class="grid grid-cols-3 gap-2">
                        <input type="number" placeholder="1" value="1" min="0.01" step="0.01" required class="item-qty w-full border rounded-lg p-2.5 text-sm outline-none text-center col-span-1 focus:ring-2 focus:ring-blue-500">
                        <input type="number" placeholder="ราคารวม" step="0.01" min="0.01" required class="item-amount w-full border rounded-lg p-2.5 text-sm outline-none text-right font-bold text-blue-700 col-span-2 focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', rowHTML);
        lucide.createIcons(); updateItemsState();
    });

    container.addEventListener('input', (e) => { if (e.target.classList.contains('item-amount')) calculateTotalAmount(); });
    container.addEventListener('click', (e) => {
        const btnRemove = e.target.closest('.btn-remove-item');
        if (btnRemove && !btnRemove.disabled) { btnRemove.closest('.item-row').remove(); calculateTotalAmount(); updateItemsState(); }
    });
}

function setupBankOptions() {
    const defaultDetailsEl = document.getElementById('default-bank-details');
    const customInputsBox = document.getElementById('custom-bank-inputs');
    const radios = document.querySelectorAll('input[name="bank_option"]');

    if (profileData.bank_name && profileData.bank_account) {
        defaultDetailsEl.innerHTML = `ธนาคาร: <b>${profileData.bank_name}</b><br>เลขบัญชี: <b>${profileData.bank_account}</b><br>ชื่อบัญชี: <b>${profileData.bank_account_name || '-'}</b>`;
    } else {
        defaultDetailsEl.innerHTML = '<span class="text-red-500">คุณยังไม่ได้ตั้งค่าบัญชีในหน้าโปรไฟล์</span>';
        document.querySelector('input[value="custom"]').checked = true;
        customInputsBox.classList.remove('hidden');
    }

    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'custom') customInputsBox.classList.remove('hidden');
            else customInputsBox.classList.add('hidden');
        });
    });
}

async function submitClearance(targetStatus) {
    const campSelect = document.getElementById('camp-select');
    const campId = campSelect.value;
    const campName = campSelect.options[campSelect.selectedIndex]?.text;
    const department = document.getElementById('department-select').value;
    const purpose = document.getElementById('purpose').value;
    const requestType = document.querySelector('input[name="request_type"]:checked')?.value;
    const files = document.getElementById('receipt-file').files;
    const remark = document.getElementById('remark').value;

    if (!campId || !department || !purpose || !requestType) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลส่วนหลักให้ครบถ้วน', 'warning');
    
    if (targetStatus === 'pending' && files.length === 0 && requestType !== 'advance') {
        return Swal.fire('ต้องมีหลักฐาน', 'การส่งคำขอเบิกเงินคืน จำเป็นต้องแนบสลิป/ใบเสร็จ อย่างน้อย 1 ไฟล์', 'warning');
    }

    const bankOption = document.querySelector('input[name="bank_option"]:checked').value;
    let finalBankName = "", finalBankAccount = "", finalAccountName = "";
    if (bankOption === 'default') {
        if (!profileData.bank_account) return Swal.fire('แจ้งเตือน', 'บัญชีเริ่มต้นไม่มีข้อมูล กรุณาเลือก "บัญชีอื่นๆ"', 'warning');
        finalBankName = profileData.bank_name; finalBankAccount = profileData.bank_account; finalAccountName = profileData.bank_account_name;
    } else {
        finalBankName = document.getElementById('custom-bank-name').value;
        finalBankAccount = document.getElementById('custom-bank-account').value;
        finalAccountName = document.getElementById('custom-bank-account-name').value;
        if (!finalBankName || !finalBankAccount) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลบัญชีรับเงินใหม่ให้ครบถ้วน', 'warning');
    }

    const items = []; let totalAmount = 0;
    document.querySelectorAll('.item-row').forEach(row => {
        const desc = row.querySelector('.item-desc').value;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 1;
        const amt = parseFloat(row.querySelector('.item-amount').value) || 0;
        if (desc && amt > 0) { items.push({ description: desc, quantity: qty, amount: amt }); totalAmount += amt; }
    });

    if (items.length === 0 || totalAmount <= 0) return Swal.fire('แจ้งเตือน', 'กรุณาระบุรายการสินค้าและยอดเงินอย่างน้อย 1 รายการ', 'warning');

    // 🌟 โค้ดเพิ่ม Pop-up สรุปข้อมูลก่อนส่งให้แอดมิน (ถ้าไม่ใช่การบันทึกร่าง)
    if (targetStatus === 'pending') {
        
        // ============================================
        // 🔒 ระบบตรวจสอบเพดานงบประมาณ (Nudge System)
        // ============================================
        try {
            const { data: budgetData } = await supabaseClient.from('department_budgets')
                .select('budget_amount').eq('camp_id', campId).eq('department', department).single();

            if (budgetData && parseFloat(budgetData.budget_amount) > 0) {
                const limit = parseFloat(budgetData.budget_amount);
                
                // คำนวณยอดที่ใช้ไปแล้ว (รวมบิลที่รอตรวจ ยกเว้นบิลที่กำลังแก้)
                const { data: usedData } = await supabaseClient.from('clearances')
                   .select('total_amount, actual_amount, status, id')
                   .eq('camp_id', campId)
                   .eq('department', department)
                   .in('request_type', ['advance', 'reimburse', 'other_expense'])
                   .neq('status', 'rejected')
                   .neq('status', 'draft');

                let used = 0;
                if(usedData) {
                    usedData.forEach(e => {
                        // ข้ามการบวกยอดของบิลใบปัจจุบัน (กรณีแก้บิลเดิม)
                        if (e.id !== draftId) { 
                            used += parseFloat((e.status === 'cleared' && e.actual_amount !== null) ? e.actual_amount : e.total_amount);
                        }
                    });
                }

                // ถ้ายอดรวมใหม่ เกินงบที่ตั้งไว้ (Option B: เตือนแต่ให้ส่งได้)
                if ((used + totalAmount) > limit) {
                    const overAmount = (used + totalAmount) - limit;
                    const warnRes = await Swal.fire({
                        title: '⚠️ แจ้งเตือน: ยอดเบิกเกินเพดานงบ!',
                        icon: 'warning',
                        html: `
                            <div class="text-left text-sm mt-2 border-t border-gray-100 pt-3">
                                <p>งบประมาณฝ่ายคุณ: <b>${limit.toLocaleString('th-TH')} ฿</b></p>
                                <p>ใช้ไปแล้ว (รวมรอตรวจ): <b>${used.toLocaleString('th-TH')} ฿</b></p>
                                <p>ยอดขอเบิกบิลนี้: <b>${totalAmount.toLocaleString('th-TH')} ฿</b></p>
                                <div class="bg-red-50 p-3 rounded-lg border border-red-200 mt-3 text-center">
                                    <p class="text-red-600 font-bold">ยอดเงินจะเกินงบอยู่ <br><span class="text-xl">${overAmount.toLocaleString('th-TH')} ฿</span></p>
                                </div>
                                <p class="text-xs text-gray-500 mt-2 text-center">คุณยังสามารถกดยืนยันส่งคำขอได้ แต่เหรัญญิกอาจตีกลับหากไม่อนุมัติกรณีพิเศษ</p>
                            </div>
                        `,
                        showCancelButton: true,
                        confirmButtonText: 'ยืนยันส่งคำขอ (กรณีพิเศษ)',
                        cancelButtonText: 'กลับไปแก้ไขตัวเลข',
                        confirmButtonColor: '#ef4444',
                        reverseButtons: true
                    });
                    
                    // ถ้ายูสเซอร์ถอดใจ กดกลับไปแก้ไข ให้หยุดการทำงานตรงนี้เลย
                    if (!warnRes.isConfirmed) return; 
                }
            }
        } catch (err) {
            console.error("Budget Check Error:", err);
            // ปล่อยผ่านถ้าดึงข้อมูลผิดพลาด เพื่อไม่ให้ระบบค้าง
        }
        // ============================================

        const typeLabel = requestType === 'advance' ? 'ยืมเงินทดรองจ่าย' : 'เบิกเงินคืน';
        const typeColor = requestType === 'advance' ? 'text-blue-600' : 'text-purple-600';
        const bankDisplay = bankOption === 'default' ? `${profileData.bank_name} (${profileData.bank_account})` : `${finalBankName} (${finalBankAccount})`;
        const nameDisplay = bankOption === 'default' ? profileData.bank_account_name : finalAccountName;

        const confirmResult = await Swal.fire({
            title: 'ตรวจสอบก่อนส่งคำขอ?',
            icon: 'info',
            html: `
                <div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2">
                    <p class="text-gray-500">ประเภท: <span class="font-bold ${typeColor}">${typeLabel}</span></p>
                    <p class="text-gray-500">หัวข้อ: <span class="font-bold text-gray-800">${purpose}</span></p>
                    <p class="text-gray-500">โครงการ: <span class="font-bold text-gray-800">${campName}</span></p>
                    <p class="text-gray-500">ยอดรวมขอเบิก: <span class="font-extrabold text-blue-600 text-xl">${totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</span></p>
                    
                    <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 mt-4 shadow-sm">
                        <p class="text-blue-800 font-bold text-xs mb-1 flex items-center gap-1"><i data-lucide="landmark" class="w-3.5 h-3.5"></i> บัญชีรับเงินของท่าน:</p>
                        <p class="text-blue-700 font-medium text-xs">${bankDisplay}</p>
                        <p class="text-blue-700 font-medium text-xs">${nameDisplay || 'ไม่ระบุชื่อบัญชี'}</p>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#9ca3af',
            confirmButtonText: 'ข้อมูลถูกต้อง ส่งคำขอเลย',
            cancelButtonText: 'กลับไปแก้ไข',
            reverseButtons: true,
            didOpen: () => { lucide.createIcons(); }
        });

        if (!confirmResult.isConfirmed) return; // ถ้ายกเลิก ให้หยุดการทำงานตรงนี้
    }

    const btnSubmit = document.getElementById('btn-submit');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.disabled = true; btnSubmit.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> กำลังบันทึกข้อมูล...';
    lucide.createIcons();

    try {
        let receiptUrlsJson = null;
        if (files.length > 0) {
            const uploadedUrls = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
const ext = file.name.split('.').pop(); // ดึงนามสกุล
// ใส่ _${i} เข้าไปเพื่อป้องกันไฟล์ที่อัปโหลดพร้อมกันในเสี้ยววินาทีชื่อซ้ำกัน
const filePath = `receipts/${currentUser.id}/${Date.now()}_${i}.${ext}`; 
const { error: uploadError } = await supabaseClient.storage.from('receipts').upload(filePath, file);
                if (uploadError) throw uploadError;
                const { data: publicUrlData } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
                uploadedUrls.push(publicUrlData.publicUrl);
            }
            receiptUrlsJson = JSON.stringify(uploadedUrls);
        }

        const clearanceDataPayload = { user_id: currentUser.id, camp_id: campId, department: department, purpose: purpose, request_type: requestType, total_amount: totalAmount, receive_bank_name: finalBankName, receive_bank_account: finalBankAccount, receive_account_name: finalAccountName, remark: remark, status: targetStatus };
        if (receiptUrlsJson) clearanceDataPayload.receipt_image_url = receiptUrlsJson;

        let returnedClearanceId = null;
        if (draftId) {
            clearanceDataPayload.reject_reason = null;
            const { error: updateError } = await supabaseClient.from('clearances').update(clearanceDataPayload).eq('id', draftId);
            if (updateError) throw updateError;
            returnedClearanceId = draftId;

            const { error: deleteErr } = await supabaseClient.from('clearance_items').delete().eq('clearance_id', draftId);
            if (deleteErr) throw new Error("ไม่สามารถเคลียร์รายการเก่าได้ กรุณาเช็ค RLS: " + deleteErr.message);
            
            const { data: checkItems } = await supabaseClient.from('clearance_items').select('id').eq('clearance_id', draftId);
            if (checkItems && checkItems.length > 0) {
                throw new Error("สิทธิ์การลบถูกปฏิเสธ! โปรดแจ้งแอดมินให้เปิดสิทธิ์ (RLS Policy: DELETE) สำหรับตาราง clearance_items ใน Supabase");
            }
            
        } else {
            const { data: newClearance, error: insertError } = await supabaseClient.from('clearances').insert(clearanceDataPayload).select().single();
            if (insertError) throw insertError;
            returnedClearanceId = newClearance.id;
        }

        const itemsToInsert = items.map(item => ({ clearance_id: returnedClearanceId, description: item.description, quantity: item.quantity, amount: item.amount }));
        const { error: itemsError } = await supabaseClient.from('clearance_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;

        await Swal.fire('สำเร็จ!', targetStatus === 'draft' ? "บันทึกแบบร่างเรียบร้อยแล้ว!" : "ส่งคำขอเบิกเงินให้แอดมินตรวจสอบเรียบร้อย!", 'success');
        window.location.href = 'history.html';
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
        btnSubmit.disabled = false; btnSubmit.innerHTML = originalText; lucide.createIcons();
    }
}

// 1. ฟังก์ชันเปิดปิดเมนู
function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

// 2. เช็คว่าเป็นแอดมินหรือเปล่า
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; 
    
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    
    if (profile && profile.role === 'admin') {
        const adminLink = document.getElementById('admin-action-link');
        if (adminLink) {
            adminLink.classList.remove('hidden');
        }
    }
});