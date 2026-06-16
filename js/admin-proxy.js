// js/admin-proxy.js
let currentUser = null;
let allProfiles = [];

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    
    // ตรวจสอบสิทธิ์
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') return window.location.href = '../member/dashboard.html';
    
    currentUser = session.user;
    await loadInitialData();
    setupDynamicItems();
    
    document.getElementById('proxy-form').addEventListener('submit', handleProxySubmit);
});

async function loadInitialData() {
    try {
        const { data: camps } = await supabaseClient.from('camps').select('*').order('created_at', { ascending: false });
        const campSelect = document.getElementById('proxy-camp');
        campSelect.innerHTML = camps.map(c => `<option value="${c.id}" ${c.is_active ? 'selected' : ''}>${c.name}</option>`).join('');

        const { data: profiles } = await supabaseClient.from('profiles').select('*').order('full_name', { ascending: true });
        allProfiles = profiles;
        const userSelect = document.getElementById('proxy-user-select');
        userSelect.innerHTML = '<option value="" disabled selected>-- เลือกสมาชิก --</option>' + 
            profiles.map(p => `<option value="${p.id}">${p.full_name} (${p.default_department || 'ไม่ระบุ'})</option>`).join('');
            
        userSelect.addEventListener('change', (e) => {
            const selectedUser = allProfiles.find(p => p.id === e.target.value);
            if(selectedUser) {
                // Auto-fill แผนก ถ้ามี
                if(selectedUser.default_department) {
                    document.getElementById('proxy-department').value = selectedUser.default_department;
                }
                // Auto-fill บัญชี
                document.getElementById('bank-name').value = selectedUser.bank_name || '';
                document.getElementById('bank-account').value = selectedUser.bank_account || '';
                document.getElementById('bank-account-name').value = selectedUser.bank_account_name || selectedUser.full_name || '';
            }
        });
    } catch (error) { console.error(error); }
}

function toggleTargetType() {
    const isMember = document.querySelector('input[name="target_type"]:checked').value === 'member';
    document.getElementById('member-select-group').style.display = isMember ? 'block' : 'none';
    document.getElementById('external-input-group').style.display = isMember ? 'none' : 'block';
    
    if(!isMember) {
        document.getElementById('bank-name').value = '';
        document.getElementById('bank-account').value = '';
        document.getElementById('bank-account-name').value = '';
    }
}

// ----------------------------------------------------
// ระบบจัดการรายการสินค้า (Dynamic Items)
// ----------------------------------------------------
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
            <div class="item-row bg-gray-50 border border-gray-100 rounded-xl p-4 relative group slide-down mt-4">
                <div class="flex justify-between items-center mb-3">
                    <span class="text-[11px] font-bold text-gray-400 bg-white px-2.5 py-1 rounded-md shadow-sm border border-gray-100 item-number">รายการที่ X</span>
                    <button type="button" class="btn-remove-item text-gray-400 hover:text-red-500 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>
                </div>
                <div class="space-y-2">
                    <div class="relative">
                        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i data-lucide="align-left" class="w-4 h-4 text-gray-400"></i></div>
                        <input type="text" placeholder="ชื่อรายการ (เช่น หมูสับ, สีน้ำมัน)" required class="item-desc w-full border border-gray-200 bg-white rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all">
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <div class="col-span-1 relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span class="text-gray-400 font-medium text-[10px]">จำนวน</span></div>
                            <input type="number" placeholder="1" value="1" min="0.01" step="0.01" required class="item-qty w-full border border-gray-200 bg-white rounded-lg py-2.5 pl-12 pr-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all text-center">
                        </div>
                        <div class="col-span-2 relative">
                            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span class="text-gray-400 font-medium text-xs">รวม (฿)</span></div>
                            <input type="number" placeholder="ราคารวม" step="0.01" min="0.01" required class="item-amount w-full border border-gray-200 bg-white rounded-lg py-2.5 pl-14 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-all text-right font-bold text-gray-700">
                        </div>
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

// ----------------------------------------------------
// บันทึกข้อมูล
// ----------------------------------------------------
async function handleProxySubmit(e) {
    e.preventDefault();
    
    const isMember = document.querySelector('input[name="target_type"]:checked').value === 'member';
    const userId = isMember ? document.getElementById('proxy-user-select').value : null;
    const unregisteredName = isMember ? null : document.getElementById('proxy-unregistered-name').value;
    const requestType = document.querySelector('input[name="request_type"]:checked')?.value;
    
    if (isMember && !userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกสมาชิก', 'warning');
    if (!isMember && !unregisteredName) return Swal.fire('แจ้งเตือน', 'กรุณาระบุชื่อบุคคล/ร้านค้า', 'warning');
    if (!requestType) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกประเภทรายการ', 'warning');

    const files = document.getElementById('receipt-file').files;
    if (requestType === 'reimburse' && files.length === 0) {
        return Swal.fire('แจ้งเตือน', 'เบิกเงินคืน ต้องแนบสลิป/ใบเสร็จด้วยครับ', 'warning');
    }

    const items = [];
    let totalAmount = 0;
    document.querySelectorAll('.item-row').forEach(row => {
        const desc = row.querySelector('.item-desc').value;
        const qty = parseFloat(row.querySelector('.item-qty').value) || 1;
        const amt = parseFloat(row.querySelector('.item-amount').value) || 0;
        if (desc && amt > 0) { items.push({ description: desc, quantity: qty, amount: amt }); totalAmount += amt; }
    });

    if (items.length === 0 || totalAmount <= 0) return Swal.fire('แจ้งเตือน', 'กรุณาระบุรายการและจำนวนเงิน', 'warning');

    const btnSubmit = document.getElementById('btn-submit');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 inline animate-spin mr-1"></i> กำลังอัปโหลดและบันทึก...';
    lucide.createIcons();

    try {
        let receiptUrlsJson = null;
        if (files.length > 0) {
            const uploadedUrls = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const ext = file.name.split('.').pop();
                const filePath = `proxy_${currentUser.id}/${Date.now()}_${i}.${ext}`;
                const { error: uploadError } = await supabaseClient.storage.from('receipts').upload(filePath, file);
                if (uploadError) throw uploadError;
                const { data: publicUrlData } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
                uploadedUrls.push(publicUrlData.publicUrl);
            }
            receiptUrlsJson = JSON.stringify(uploadedUrls);
        }

        const payload = {
            proxy_created_by: currentUser.id,
            user_id: userId,
            unregistered_name: unregisteredName,
            camp_id: document.getElementById('proxy-camp').value,
            request_type: requestType,
            purpose: document.getElementById('proxy-purpose').value,
            department: document.getElementById('proxy-department').value,
            total_amount: totalAmount,
            remark: document.getElementById('remark').value,
            status: 'pending', 
            receive_bank_name: document.getElementById('bank-name').value,
            receive_bank_account: document.getElementById('bank-account').value,
            receive_account_name: document.getElementById('bank-account-name').value
        };

        if (receiptUrlsJson) payload.receipt_image_url = receiptUrlsJson;

        const { data: newClearance, error: insertError } = await supabaseClient.from('clearances').insert([payload]).select().single();
        if (insertError) throw insertError;

        const itemsToInsert = items.map(item => ({ 
            clearance_id: newClearance.id, 
            description: item.description, 
            quantity: item.quantity, 
            amount: item.amount 
        }));
        
        const { error: itemsError } = await supabaseClient.from('clearance_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;

        await Swal.fire('สำเร็จ!', 'สร้างคำขอเบิกแทนเรียบร้อยแล้ว รายการจะแสดงในกล่องงานรออนุมัติ', 'success');
        window.location.href = 'dashboard.html';

    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i data-lucide="send" class="w-5 h-5 inline mb-0.5 mr-1"></i> ยืนยันการสร้างคำขอ';
        lucide.createIcons();
    }
}