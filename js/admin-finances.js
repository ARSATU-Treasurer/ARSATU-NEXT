// js/admin-finances.js

let allBanks = [];
let allFunds = []; // เก็บข้อมูลกองทุน

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') return window.location.href = '../member/dashboard.html';

    // 🌟 โหลดข้อมูลทั้งหมดเมื่อเปิดหน้า
    fetchBanks();
    fetchTransactions();
    fetchFunds();

    // ผูก Event Listener ให้ Form ต่างๆ
    document.getElementById('bank-form')?.addEventListener('submit', handleSaveBank);
    document.getElementById('transfer-form')?.addEventListener('submit', handleTransferMoney);
    document.getElementById('fund-form')?.addEventListener('submit', handleSaveFund);
});

// ================= จัดการบัญชีธนาคาร ================= //

async function fetchBanks() {
    const grid = document.getElementById('banks-grid');
    const filter = document.getElementById('filter-bank');
    const transferFrom = document.getElementById('transfer-from');
    const transferTo = document.getElementById('transfer-to');

    try {
        const { data: banks, error } = await supabaseClient.from('bank_accounts').select('*').order('created_at', { ascending: true });
        if (error) throw error;
        
        allBanks = banks;
        grid.innerHTML = '';
        
        // รีเซ็ต Dropdown
        filter.innerHTML = '<option value="all">ทุกบัญชีรวมกัน</option>';
        let optionsHTML = '<option value="" disabled selected>-- เลือกบัญชี --</option>';

        if(banks.length === 0) {
            grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-10">ยังไม่มีบัญชีในระบบ</p>';
        } else {
            banks.forEach(b => {
                const hexColor = b.color || '#3B82F6';
                
                // สร้าง Card บัญชี
                grid.innerHTML += `
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                    <div class="absolute top-0 left-0 w-1.5 h-full" style="background-color: ${hexColor}"></div>
                    <div class="flex justify-between items-start mb-3">
                        <div class="pl-2">
                            <h3 class="font-bold text-gray-800 text-base" style="color: ${hexColor}">${b.name}</h3>
                            <p class="text-xs text-gray-500 font-mono mt-0.5">${b.account_number || 'ไม่ได้ระบุเลขบัญชี'}</p>
                        </div>
                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="editBank('${b.id}')" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><i data-lucide="edit" class="w-4 h-4"></i></button>
                            <button onclick="deleteBank('${b.id}')" class="p-1.5 text-red-500 hover:bg-red-50 rounded"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-50 pl-2">
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">ยอดเงินคงเหลือ</p>
                        <p class="text-2xl font-extrabold text-gray-800">${parseFloat(b.balance).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                    </div>
                </div>`;

                // ใส่ Dropdowns
                const option = `<option value="${b.id}">${b.name} (${parseFloat(b.balance).toLocaleString()} ฿)</option>`;
                filter.innerHTML += `<option value="${b.id}">${b.name}</option>`;
                optionsHTML += option;
            });
        }
        
        transferFrom.innerHTML = optionsHTML;
        transferTo.innerHTML = optionsHTML;
        lucide.createIcons();

    } catch (err) { grid.innerHTML = `<p class="col-span-full text-red-500 text-center">Error: ${err.message}</p>`; }
}

function openBankModal() {
    document.getElementById('bank-modal-title').innerText = 'เพิ่มบัญชีธนาคาร';
    document.getElementById('bank-form').reset();
    document.getElementById('bank-id').value = '';
    document.getElementById('bank-color').value = '#3B82F6';
    document.getElementById('bank-modal').classList.remove('hidden');
}

function closeBankModal() { document.getElementById('bank-modal').classList.add('hidden'); }

function editBank(id) {
    const bank = allBanks.find(b => b.id === id);
    if(!bank) return;
    document.getElementById('bank-modal-title').innerText = 'แก้ไขบัญชี';
    document.getElementById('bank-id').value = bank.id;
    document.getElementById('bank-name').value = bank.name;
    document.getElementById('bank-acc-num').value = bank.account_number || '';
    document.getElementById('bank-color').value = bank.color || '#3B82F6';
    document.getElementById('bank-balance').value = bank.balance;
    document.getElementById('bank-modal').classList.remove('hidden');
}

async function handleSaveBank(e) {
    e.preventDefault();
    const idInput = document.getElementById('bank-id');
    const id = idInput ? idInput.value.trim() : ''; // ดึงค่าและตัดช่องว่าง
    const name = document.getElementById('bank-name').value.trim();
    const accNum = document.getElementById('bank-acc-num').value.trim();
    const color = document.getElementById('bank-color').value;
    const balance = document.getElementById('bank-balance').value;

    const btn = document.getElementById('btn-save-bank');
    btn.disabled = true; btn.innerText = 'กำลังบันทึก...';

    try {
        if(id) {
            // ถ้ามี ID ค้างอยู่แปลว่าเป็นการ แก้ไข (Update)
            await supabaseClient.from('bank_accounts').update({ name, account_number: accNum, color, balance }).eq('id', id);
        } else {
            // ถ้าไม่มี ID แปลว่าเป็นการ เพิ่มใหม่ (Insert)
            await supabaseClient.from('bank_accounts').insert([{ name, account_number: accNum, color, balance }]);
        }
        
        // 🌟 FIX: สั่งล้างฟอร์มและ "ล้าง ID" ทิ้งทันที ป้องกันบั๊กเขียนทับบัญชีเดิมในการเพิ่มรอบหน้า
        if(idInput) idInput.value = '';
        document.getElementById('bank-form').reset();
        
        closeBankModal();
        fetchBanks();
        fetchTransactions();
    } catch(err) { 
        Swal.fire('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาด: ' + err.message, 'error'); 
    } finally { 
        btn.disabled = false; btn.innerText = 'บันทึกข้อมูล'; 
    }
}

async function deleteBank(id) {
    if(!confirm("⚠️ คุณต้องการลบบัญชีนี้ใช่หรือไม่? (ประวัติการทำรายการอาจได้รับผลกระทบ)")) return;
    await supabaseClient.from('bank_accounts').delete().eq('id', id);
    fetchBanks();
}

// ================= ระบบโอนเงินข้ามบัญชี ================= //

function openTransferModal() { document.getElementById('transfer-form').reset(); document.getElementById('transfer-modal').classList.remove('hidden'); }
function closeTransferModal() { document.getElementById('transfer-modal').classList.add('hidden'); }

let isProcessingTransfer = false;

async function handleTransferMoney(e) {
    e.preventDefault();
    
    // ป้องกันคนกดย้ำๆ (คลิกเบิ้ล)
    if (isProcessingTransfer) return;
    isProcessingTransfer = true;

    const fromId = document.getElementById('transfer-from').value;
    const toId = document.getElementById('transfer-to').value;
    const amount = parseFloat(document.getElementById('transfer-amount').value);
    const slipFile = document.getElementById('transfer-slip')?.files[0];

    if(fromId === toId) {
        isProcessingTransfer = false;
        return Swal.fire('ไม่สามารถโอนเข้าบัญชีเดียวกันได้','','warning');
    }
    
    const btn = document.getElementById('btn-save-transfer');
    btn.disabled = true; 
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 inline animate-spin"></i> กำลังประมวลผล...';
    lucide.createIcons();

    try {
        // เช็คแค่ว่าเงินต้นทางพอโอนไหม
        const { data: currentBankFrom, error: errFrom } = await supabaseClient.from('bank_accounts').select('name, balance').eq('id', fromId).single();
        const { data: currentBankTo, error: errTo } = await supabaseClient.from('bank_accounts').select('name').eq('id', toId).single();
        
        if (errFrom || errTo) throw new Error("ไม่สามารถดึงข้อมูลบัญชีได้");

        if(parseFloat(currentBankFrom.balance) < amount) {
            isProcessingTransfer = false;
            btn.disabled = false; btn.innerText = 'ยืนยันการโอนเงิน';
            return Swal.fire(`บัญชี ${currentBankFrom.name} มีเงินไม่พอโอน`, `(คงเหลือ ${parseFloat(currentBankFrom.balance).toLocaleString()} ฿)`, 'warning');
        }

        let slipUrl = null;
        if (slipFile) {
            const filePath = `transfer_slips/${Date.now()}_${slipFile.name}`;
            await supabaseClient.storage.from('receipts').upload(filePath, slipFile);
            const { data } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
            slipUrl = data.publicUrl;
        }

        const { data: { session } } = await supabaseClient.auth.getSession();
        const descSuffix = slipUrl ? ` | <a href="${slipUrl}" target="_blank" class="text-blue-500 underline font-bold">ดูสลิป</a>` : '';

        // 🌟 แก้ไขจุดสำคัญ: ลบคำสั่ง update bank_accounts ออกไป
        // บันทึกแค่ประวัติลงตาราง transactions อย่างเดียว แล้วปล่อยให้ Database Trigger ทำหน้าที่บวกลบเงินอัตโนมัติ
        await supabaseClient.from('transactions').insert([
            {
                bank_account_id: fromId,
                transaction_type: 'expense',
                amount: amount,
                description: `โอนเงินออกไปยังบัญชี: ${currentBankTo.name}${descSuffix}`,
                created_by: session.user.id
            },
            {
                bank_account_id: toId,
                transaction_type: 'income',
                amount: amount,
                description: `รับเงินโอนเข้าจากบัญชี: ${currentBankFrom.name}${descSuffix}`,
                created_by: session.user.id
            }
        ]);

        Swal.fire('✅ โอนเงินระหว่างบัญชีสำเร็จ!', '', 'success');
        document.getElementById('transfer-form').reset();
        closeTransferModal();
        fetchBanks();
        fetchTransactions();
    } catch(err) { 
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); 
    } finally { 
        isProcessingTransfer = false;
        btn.disabled = false; 
        btn.innerText = 'ยืนยันการโอนเงิน'; 
    }
}

// ================= ประวัติการทำรายการ (Transactions) ================= //

async function fetchTransactions() {
    const bankId = document.getElementById('filter-bank').value;
    const tbody = document.getElementById('transactions-body');
    tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>';

    try {
        let query = supabaseClient.from('transactions').select('*, bank_accounts(name, color)').order('created_at', { ascending: false });
        if(bankId !== 'all') query = query.eq('bank_account_id', bankId);

        const { data: trans, error } = await query;
        if(error) throw error;

        if(trans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-400">ยังไม่มีประวัติการทำรายการ</td></tr>';
            return;
        }

        tbody.innerHTML = trans.map(t => {
            const isIncome = t.transaction_type === 'income';
            const date = new Date(t.created_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
            const bankColor = t.bank_accounts?.color || '#9ca3af';
            
            return `
            <tr class="hover:bg-gray-50 border-b border-gray-50">
                <td class="p-4 text-xs text-gray-500">${date}</td>
                <td class="p-4 text-xs font-medium text-gray-800">${t.description}</td>
                <td class="p-4 text-xs">
                    <span class="px-2 py-1 rounded border shadow-sm font-bold bg-white" style="color: ${bankColor}; border-color: ${bankColor}40">
                        ${t.bank_accounts?.name || 'ไม่ทราบ'}
                    </span>
                </td>
                <td class="p-4 text-right font-bold ${isIncome ? 'text-green-600' : 'text-red-600'} text-sm">
                    ${isIncome ? '+' : '-'}${parseFloat(t.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}
                </td>
            </tr>`;
        }).join('');

    } catch(err) { tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-red-500">${err.message}</td></tr>`; }
}

// ================= ระบบจัดการกองทุน (Funds) ส่วนกลาง ================= //

async function fetchFunds() {
    const grid = document.getElementById('funds-grid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="text-center py-5 text-gray-400 col-span-full"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>';
    lucide.createIcons();

    try {
        // 🌟 ดึงกองทุนทั้งหมดโดยไม่สนใจ camp_id
        const { data: funds, error } = await supabaseClient.from('funds').select('*').order('created_at', { ascending: true });
        if (error) throw error;

        allFunds = funds;
        grid.innerHTML = '';

        if (funds.length === 0) {
            grid.innerHTML = '<p class="col-span-full text-center text-gray-400 py-6 bg-white rounded-2xl border border-dashed border-gray-200">ยังไม่มีกองทุนส่วนกลางในระบบ</p>';
        } else {
            funds.forEach(f => {
                grid.innerHTML += `
                <div class="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 relative overflow-hidden group">
                    <div class="absolute top-0 left-0 w-1.5 h-full bg-purple-500"></div>
                    <div class="flex justify-between items-start mb-3">
                        <div class="pl-2">
                            <h3 class="font-bold text-gray-800 text-base">${f.name}</h3>
                        </div>
                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="editFund('${f.id}')" class="p-1.5 text-blue-500 hover:bg-blue-50 rounded"><i data-lucide="edit" class="w-4 h-4"></i></button>
                            <button onclick="deleteFund('${f.id}')" class="p-1.5 text-red-500 hover:bg-red-50 rounded"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <div class="mt-4 pt-4 border-t border-gray-50 pl-2">
                        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">ยอดเงินคงเหลือ</p>
                        <p class="text-2xl font-extrabold text-purple-600">${parseFloat(f.balance).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                    </div>
                </div>`;
            });
        }
        lucide.createIcons();
    } catch (error) { grid.innerHTML = `<p class="col-span-full text-red-500 text-center">Error: ${error.message}</p>`; }
}

function openFundModal() {
    document.getElementById('fund-modal-title').innerText = 'เพิ่มกองทุนใหม่';
    document.getElementById('fund-form').reset();
    document.getElementById('fund-id').value = '';
    document.getElementById('fund-modal').classList.remove('hidden');
}

function closeFundModal() { document.getElementById('fund-modal').classList.add('hidden'); }

function editFund(id) {
    const fund = allFunds.find(f => f.id === id);
    if(!fund) return;
    document.getElementById('fund-modal-title').innerText = 'แก้ไขกองทุน';
    document.getElementById('fund-id').value = fund.id;
    document.getElementById('fund-name').value = fund.name;
    document.getElementById('fund-balance').value = fund.balance;
    document.getElementById('fund-modal').classList.remove('hidden');
}

async function handleSaveFund(e) {
    e.preventDefault();
    const idInput = document.getElementById('fund-id');
    const id = idInput ? idInput.value.trim() : '';
    const name = document.getElementById('fund-name').value.trim();
    const balance = document.getElementById('fund-balance').value;

    const btn = document.getElementById('btn-save-fund');
    btn.disabled = true; btn.innerText = 'กำลังบันทึก...';

    try {
        if(id) {
            await supabaseClient.from('funds').update({ name, balance }).eq('id', id);
        } else {
            // 🌟 ไม่ต้องส่ง camp_id ไปแล้ว
            await supabaseClient.from('funds').insert([{ name, balance }]);
        }
        
        if(idInput) idInput.value = '';
        document.getElementById('fund-form').reset();
        
        Swal.fire('บันทึกข้อมูลสำเร็จ', '', 'success');
        closeFundModal();
        fetchFunds(); // 👈 ดึงข้อมูลใหม่
    } catch(err) { 
        Swal.fire('เกิดข้อผิดพลาด', 'เกิดข้อผิดพลาด: ' + err.message, 'error'); 
    } finally { 
        btn.disabled = false; btn.innerText = 'บันทึกข้อมูล'; 
    }
}

async function deleteFund(id) {
    if(!confirm("⚠️ คุณต้องการลบกองทุนนี้ใช่หรือไม่?")) return;
    await supabaseClient.from('funds').delete().eq('id', id);
    fetchFunds(); // 👈 ดึงข้อมูลใหม่
}




// ฟังก์ชัน เปิด-ปิด ตัวเลือกเมนูแอดมิน
function toggleAdminActionMenu() {
    const overlay = document.getElementById('admin-action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

// ฟังก์ชัน ลอจิกการกดปุ่มจัดการโครงการ (Camps)
function handleManageCampsClick() {
    toggleAdminActionMenu();
    // ถ้าอยู่ที่หน้า Dashboard หลัก (ซึ่งมีฟังก์ชันเปิดกล่องจัดการค่ายอยู่แล้ว) ให้เรียกเปิดได้เลย
    if (typeof openManageCampsModal === 'function') {
        openManageCampsModal();
    } else {
        // ถ้าอยู่หน้าอื่น (เช่น หน้าเงินบริจาค/การเงิน) ให้ลิงก์กลับไปหน้าหลักพร้อมติดพารามิเตอร์เปิดกล่อง
        window.location.href = 'dashboard.html?manage=camps';
    }
}