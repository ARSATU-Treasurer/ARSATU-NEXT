// js/clearances.js

let currentUser = null;
let profileData = null;
let draftId = new URLSearchParams(window.location.search).get('id');

// 🌟 สร้างตัวแปรใหม่ เพื่อเก็บรูปที่ดึงจากคลัง
let selectedVaultFiles = [];
let tempSelectedVault = [];

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

// ... [โค้ดเดิม loadCamps, loadDraftData, calculateTotalAmount, setupDynamicItems, setupBankOptions] ...
// (เพื่อความสมบูรณ์ ผมรวบรวมฟังก์ชันเหล่านั้นมาให้ครบด้วยครับ)

async function loadCamps() {
    const selectEl = document.getElementById('camp-select');
    const { data: camps } = await supabaseClient.from('camps').select('id, name, is_active').order('created_at', { ascending: false });
    if (camps) {
        selectEl.innerHTML = '<option value="" disabled selected>-- เลือกโครงการ --</option>';
        camps.forEach(camp => {
            const option = document.createElement('option');
            option.value = camp.id; option.innerText = camp.name + (camp.is_active ? ' (ปัจจุบัน)' : '');
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

// ================= 🌟 ฟังก์ชันใหม่: ดึงเอกสารจากคลัง (Vault) ================= //

async function openVaultModal() {
    document.getElementById('vault-modal').classList.remove('hidden');
    tempSelectedVault = [...selectedVaultFiles];
    const container = document.getElementById('vault-modal-content');
    container.innerHTML = '<div class="text-center py-8 text-gray-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i> กำลังโหลดคลัง...</div>';
    lucide.createIcons();

    try {
        const { data, error } = await supabaseClient.from('member_vault').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500 text-sm">ไม่มีเอกสารในคลังของคุณ<br><a href="vault.html" class="text-blue-500 underline mt-2 block font-bold">ไปสแกนเก็บบิลใหม่</a></div>';
            return;
        }

        container.innerHTML = '<div class="grid grid-cols-2 gap-3 pb-4">' + data.map(doc => {
            const isSelected = tempSelectedVault.some(f => f.url === doc.file_url);
            return `
                <div onclick="toggleVaultItem(this, '${doc.file_url}', '${doc.title}')" class="relative bg-white rounded-xl shadow-sm border-2 cursor-pointer overflow-hidden transition-all ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'}">
                    <img src="${doc.file_url}" class="w-full h-24 object-cover">
                    <div class="p-2 bg-white">
                        <p class="text-[10px] font-bold text-gray-800 truncate">${doc.title}</p>
                        <p class="text-[9px] text-gray-400">${new Date(doc.created_at).toLocaleDateString('th-TH')}</p>
                    </div>
                    <div class="vault-checkbox absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white transition-colors ${isSelected ? 'border-blue-500 text-blue-500' : 'border-gray-300 text-transparent'}">
                        <i data-lucide="check" class="w-3 h-3"></i>
                    </div>
                </div>
            `;
        }).join('') + '</div>';
        lucide.createIcons();
    } catch(err) {
        container.innerHTML = `<div class="text-center py-8 text-red-500 text-xs">Error: ${err.message}</div>`;
    }
}

window.toggleVaultItem = function(cardEl, url, title) {
    const idx = tempSelectedVault.findIndex(f => f.url === url);
    const checkbox = cardEl.querySelector('.vault-checkbox');
    if (idx > -1) {
        tempSelectedVault.splice(idx, 1);
        cardEl.classList.remove('border-blue-500', 'ring-2', 'ring-blue-200');
        cardEl.classList.add('border-gray-200');
        checkbox.classList.remove('border-blue-500', 'text-blue-500');
        checkbox.classList.add('border-gray-300', 'text-transparent');
    } else {
        tempSelectedVault.push({ url, title });
        cardEl.classList.remove('border-gray-200');
        cardEl.classList.add('border-blue-500', 'ring-2', 'ring-blue-200');
        checkbox.classList.remove('border-gray-300', 'text-transparent');
        checkbox.classList.add('border-blue-500', 'text-blue-500');
    }
}

window.closeVaultModal = function() {
    document.getElementById('vault-modal').classList.add('hidden');
}

window.confirmVaultSelection = function() {
    selectedVaultFiles = [...tempSelectedVault];
    renderVaultPreview();
    closeVaultModal();
}

window.removeVaultFile = function(url) {
    selectedVaultFiles = selectedVaultFiles.filter(f => f.url !== url);
    renderVaultPreview();
}

function renderVaultPreview() {
    const container = document.getElementById('vault-preview-container');
    if (selectedVaultFiles.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    container.innerHTML = selectedVaultFiles.map(f => `
        <div class="bg-blue-50 border border-blue-100 rounded-lg p-1.5 flex items-center justify-between gap-2 w-full">
            <div class="flex items-center gap-2 overflow-hidden">
                <img src="${f.url}" class="w-8 h-8 rounded border border-blue-200 object-cover shrink-0">
                <span class="text-xs font-bold text-blue-700 truncate">${f.title}</span>
            </div>
            <button type="button" onclick="removeVaultFile('${f.url}')" class="text-blue-400 hover:text-red-500 p-2 shrink-0"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
}

// ================= จบฟังก์ชันดึงจากคลัง ================= //


async function submitClearance(targetStatus) {
    const campSelect = document.getElementById('camp-select');
    const campId = campSelect.value;
    const department = document.getElementById('department-select').value;
    const purpose = document.getElementById('purpose').value;
    const requestType = document.querySelector('input[name="request_type"]:checked')?.value;
    const files = document.getElementById('receipt-file').files;
    const remark = document.getElementById('remark').value;

    if (!campId || !department || !purpose || !requestType) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลส่วนหลักให้ครบถ้วน', 'warning');
    
    // 🌟 อัปเดตเงื่อนไข: ตรวจสอบว่าต้องมีไฟล์ใหม่ หรือ ไฟล์จากคลังอย่างใดอย่างหนึ่ง
    if (targetStatus === 'pending' && files.length === 0 && selectedVaultFiles.length === 0 && requestType !== 'advance') {
        return Swal.fire('ต้องมีหลักฐาน', 'การส่งเบิกเงินคืน จำเป็นต้องแนบสลิป/ใบเสร็จ อย่างน้อย 1 ไฟล์ (อัปโหลดใหม่ หรือเลือกจากคลัง)', 'warning');
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
        if (!finalBankName || !finalBankAccount) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลบัญชีรับเงินให้ครบถ้วน', 'warning');
    }

    const items = []; let totalAmount = 0;
    document.querySelectorAll('.item-row').forEach(row => {
        const desc = row.querySelector('.item-desc').value;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 1;
        const amt = parseFloat(row.querySelector('.item-amount').value) || 0;
        if (desc && amt > 0) { items.push({ description: desc, quantity: qty, amount: amt }); totalAmount += amt; }
    });

    if (items.length === 0 || totalAmount <= 0) return Swal.fire('แจ้งเตือน', 'กรุณาระบุรายการสินค้าอย่างน้อย 1 รายการ', 'warning');

    if (targetStatus === 'pending') {
        const confirmResult = await Swal.fire({
            title: 'ตรวจสอบก่อนส่งคำขอ?',
            icon: 'info',
            html: `
                <div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2">
                    <p class="text-gray-500">หัวข้อ: <span class="font-bold text-gray-800">${purpose}</span></p>
                    <p class="text-gray-500">ยอดรวมขอเบิก: <span class="font-extrabold text-blue-600 text-xl">${totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</span></p>
                    <p class="text-[11px] text-green-600 font-bold mt-2"><i data-lucide="paperclip" class="w-3.5 h-3.5 inline"></i> แนบเอกสาร: อัปโหลด ${files.length} / คลัง ${selectedVaultFiles.length} รูป</p>
                </div>
            `,
            showCancelButton: true, confirmButtonColor: '#3b82f6', cancelButtonColor: '#9ca3af', confirmButtonText: 'ข้อมูลถูกต้อง ส่งคำขอเลย', cancelButtonText: 'กลับไปแก้ไข', reverseButtons: true, didOpen: () => { lucide.createIcons(); }
        });
        if (!confirmResult.isConfirmed) return;
    }

    const btnSubmit = document.getElementById('btn-submit');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.disabled = true; btnSubmit.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> กำลังบันทึกข้อมูล...';
    lucide.createIcons();

    try {
        let receiptUrlsJson = null;
        let uploadedUrls = [];
        
        // 1. อัปโหลดไฟล์ใหม่ (ถ้ามี)
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const ext = file.name.split('.').pop();
                const filePath = `receipts/${currentUser.id}/${Date.now()}_${i}.${ext}`; 
                const { error: uploadError } = await supabaseClient.storage.from('receipts').upload(filePath, file);
                if (uploadError) throw uploadError;
                const { data: publicUrlData } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
                uploadedUrls.push(publicUrlData.publicUrl);
            }
        }
        
        // 🌟 2. นำ URL จากไฟล์ใหม่ มารวมกับ URL ที่เลือกจากคลังส่วนตัว (Member Vault)
        const vaultUrls = selectedVaultFiles.map(f => f.url);
        const finalUrls = [...uploadedUrls, ...vaultUrls];
        
        if (finalUrls.length > 0) {
            receiptUrlsJson = JSON.stringify(finalUrls);
        }

        const clearanceDataPayload = { user_id: currentUser.id, camp_id: campId, department: department, purpose: purpose, request_type: requestType, total_amount: totalAmount, receive_bank_name: finalBankName, receive_bank_account: finalBankAccount, receive_account_name: finalAccountName, remark: remark, status: targetStatus };
        if (receiptUrlsJson) clearanceDataPayload.receipt_image_url = receiptUrlsJson;

        let returnedClearanceId = null;
        if (draftId) {
            clearanceDataPayload.reject_reason = null;
            await supabaseClient.from('clearances').update(clearanceDataPayload).eq('id', draftId);
            returnedClearanceId = draftId;
            await supabaseClient.from('clearance_items').delete().eq('clearance_id', draftId);
        } else {
            const { data: newClearance } = await supabaseClient.from('clearances').insert(clearanceDataPayload).select().single();
            returnedClearanceId = newClearance.id;
        }

        const itemsToInsert = items.map(item => ({ clearance_id: returnedClearanceId, description: item.description, quantity: item.quantity, amount: item.amount }));
        await supabaseClient.from('clearance_items').insert(itemsToInsert);

        await Swal.fire('สำเร็จ!', targetStatus === 'draft' ? "บันทึกแบบร่างเรียบร้อยแล้ว!" : "ส่งคำขอเบิกเงินให้แอดมินตรวจสอบเรียบร้อย!", 'success');
        window.location.href = 'history.html';
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
        btnSubmit.disabled = false; btnSubmit.innerHTML = originalText; lucide.createIcons();
    }
}

function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}