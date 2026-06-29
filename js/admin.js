// js/admin.js
let currentTab = 'pending_expense';

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') return window.location.href = '../member/dashboard.html';

    fetchClearances(currentTab);
    updateBadges();

    // โหลดกราฟ Analytics
    loadAnalytics();

    if (document.getElementById('add-camp-form')) {
        document.getElementById('add-camp-form').addEventListener('submit', handleAddCamp);
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('manage') === 'camps' && typeof openManageCampsModal === 'function') {
        openManageCampsModal();
    }
});

async function updateBadges() {
    try {
        const { count: expCount } = await supabaseClient.from('clearances').select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'pending_clearance'])
            .in('request_type', ['advance', 'reimburse', 'other_expense']);
        
        const { count: incCount } = await supabaseClient.from('clearances').select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
            .in('request_type', ['income', 'other_income']);

        const badgeExp = document.getElementById('badge-exp');
        const badgeInc = document.getElementById('badge-inc');

        if(expCount > 0) { badgeExp.innerText = expCount; badgeExp.classList.remove('hidden'); } else { badgeExp.classList.add('hidden'); }
        if(incCount > 0) { badgeInc.innerText = incCount; badgeInc.classList.remove('hidden'); } else { badgeInc.classList.add('hidden'); }
    } catch (e) { console.error(e); }
}

function switchTab(tab) {
    currentTab = tab;
    const tabs = ['pending_expense', 'pending_income', 'approved', 'rejected'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-${t}`);
        if (t === tab) {
            btn.className = `px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition-all border border-transparent ${t==='pending_income' ? 'bg-pink-500' : (t==='pending_expense' ? 'bg-indigo-600' : (t==='approved' ? 'bg-green-500' : 'bg-red-500'))}`;
        } else {
            btn.className = "px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-gray-500 hover:bg-gray-50 border border-gray-200 shadow-sm transition-all";
        }
    });
    fetchClearances(tab);
}

async function fetchClearances(status) {
    const container = document.getElementById('requests-container');
    container.innerHTML = '<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2"></i></div>';
    lucide.createIcons();

    try {
        let query = supabaseClient.from('clearances').select(`id, status, request_type, purpose, department, total_amount, actual_amount, camp_id, created_at, profiles!user_id(full_name), camps(name)`).order('created_at', { ascending: false });        
        
        if (status === 'pending_expense') {
            query = query.in('status', ['pending', 'pending_clearance']).in('request_type', ['advance', 'reimburse', 'other_expense']);
        } else if (status === 'pending_income') {
            query = query.eq('status', 'pending').in('request_type', ['income', 'other_income']);
        } else if (status === 'approved') {
            query = query.in('status', ['approved', 'cleared', 'advance_transferred']);
        } else {
            query = query.eq('status', 'rejected');
        }

        const { data: clearances, error } = await query;
        if (error) throw error;

        if (!clearances || clearances.length === 0) {
            container.innerHTML = `<div class="text-center py-12 bg-white/60 backdrop-blur-sm rounded-2xl border border-dashed border-gray-300"><i data-lucide="check-circle" class="w-12 h-12 text-gray-300 mx-auto mb-3"></i><p class="text-gray-500 font-medium">ไม่มีรายการค้างในแท็บนี้</p></div>`;
            lucide.createIcons(); 
            return;
        }
        renderClearances(clearances);
    } catch (err) { 
        container.innerHTML = `<p class="text-red-500 text-center">เกิดข้อผิดพลาด: ${err.message}</p>`; 
    }
}

function renderClearances(clearances) {
    const container = document.getElementById('requests-container');
    container.innerHTML = '';

    clearances.forEach(item => {
        let typeLabel = '';
        if (item.request_type === 'advance') typeLabel = '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">ยืมเงินทดรอง</span>';
        else if (item.request_type === 'reimburse') typeLabel = '<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold">เบิกเงินคืน</span>';
        else if (item.request_type === 'other_expense') typeLabel = '<span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold">รายจ่ายฉุกเฉิน</span>';
        else if (item.request_type === 'other_income') typeLabel = '<span class="bg-teal-100 text-teal-700 px-2 py-0.5 rounded text-[10px] font-bold">รายรับอื่น ๆ</span>';
        else if (item.request_type === 'income') typeLabel = '<span class="bg-pink-100 text-pink-700 px-2 py-0.5 rounded text-[10px] font-bold">เงินบริจาคค่าย</span>';

        let amountDisplay = '';
        if (item.request_type === 'income' || item.request_type === 'other_income') {
            amountDisplay = `ยอดเงินเข้า: ${parseFloat(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿`;
        } else if (item.request_type === 'other_expense') {
            amountDisplay = `ยอดเงินออก: ${parseFloat(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿`;
        } else if (item.status === 'pending_clearance' || item.status === 'cleared') {
            const val = item.actual_amount !== null ? item.actual_amount : item.total_amount;
            amountDisplay = `จ่ายจริง: ${parseFloat(val).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿`;
        } else {
            amountDisplay = `ยอดขอเบิก: ${parseFloat(item.total_amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿`;
        }

        const safePurpose = (item.purpose || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        let actionButtonsHTML = '';
        if (item.status === 'pending') {
            const isInc = item.request_type === 'income' || item.request_type === 'other_income';
            const btnText = isInc ? 'อนุมัติและรับเงินเข้า' : 'อนุมัติและโอนเงินจ่าย';
            // 🌟 FIX: เติมเครื่องหมาย ' ปิดตัวแปร item.request_type ให้ครบ
            actionButtonsHTML = `
                <button onclick="openApproveModal('${item.id}', ${item.total_amount}, '${item.camp_id}', '${item.request_type}', 0, '${safePurpose}')" class="flex-1 bg-gradient-to-r ${isInc ? 'from-pink-500 to-rose-500':'from-green-500 to-emerald-500'} text-white text-xs font-bold py-2.5 rounded-xl transition-transform hover:scale-[1.02] flex justify-center items-center gap-1"><i data-lucide="check" class="w-4 h-4"></i> ${btnText}</button>
                <button onclick="updateStatus('${item.id}', 'rejected', '${safePurpose}')" class="flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2.5 rounded-xl border border-red-100 flex justify-center items-center gap-1">ตีกลับ</button>`;
        } else if (item.status === 'pending_clearance') {
            actionButtonsHTML = `
                <button onclick="openApproveModal('${item.id}', ${item.total_amount}, '${item.camp_id}', 'reconcile', ${item.actual_amount}, '${safePurpose}')" class="flex-1 bg-gradient-to-r from-orange-400 to-amber-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm hover:scale-[1.02] flex justify-center items-center gap-1"><i data-lucide="calculator" class="w-4 h-4"></i> ตรวจกระทบยอด</button>
                <button onclick="updateStatus('${item.id}', 'advance_transferred', '${safePurpose}')" class="flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold py-2.5 rounded-xl border border-red-100 flex justify-center items-center gap-1">ตีกลับให้แก้บิล</button>`;
        } else if (item.status === 'advance_transferred' || (item.status === 'approved' && item.request_type === 'advance')) {
            actionButtonsHTML = `
                <button onclick="window.location.href='../member/clear-bill.html?id=${item.id}'" class="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm hover:scale-[1.02] flex justify-center items-center gap-1">
                    <i data-lucide="receipt" class="w-4 h-4"></i> เคลียร์บิลแทน
                </button>`;
        } else {
            actionButtonsHTML = `
                <div class="flex-1 text-center py-2.5 text-[11px] font-bold text-gray-500 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center">ดำเนินการเรียบร้อย</div>
                <button onclick="voidRequest('${item.id}')" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors flex items-center justify-center gap-1 border border-red-100 shrink-0" title="ยกเลิกการอนุมัติ">
                    <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Void
                </button>`;
        }

        const cardHTML = `
            <div class="bg-white/90 backdrop-blur-sm rounded-2xl p-5 shadow-sm border border-white">
                <div class="flex justify-between items-start mb-3 border-b border-gray-100 pb-3">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            ${item.status === 'pending_clearance' ? '<span class="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">รอตรวจเคลียร์บิล</span>' : ''}
                            ${typeLabel}
                        </div>
                        <h3 class="font-bold text-gray-800 text-sm">${item.purpose}</h3>
                        <p class="text-xs text-gray-500 mt-0.5">${item.profiles?.full_name || 'ไม่ระบุชื่อ'} (ฝ่าย ${item.department})</p>
                    </div>
                    <div class="text-right"><span class="block text-sm font-extrabold text-gray-800">${amountDisplay}</span></div>
                </div>
                <div class="flex gap-2 mt-4">
                    <button onclick="viewDetails('${item.id}')" class="flex-1 bg-white hover:bg-gray-50 text-gray-600 text-xs font-bold py-2.5 rounded-xl border border-gray-200 flex justify-center items-center gap-1"><i data-lucide="file-search" class="w-4 h-4"></i> รายละเอียด</button>
                    ${actionButtonsHTML}
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', cardHTML);
    });
    lucide.createIcons();
}

async function updateStatus(clearanceId, newStatus, purpose = 'รายการนี้') {
    const titleText = newStatus === 'rejected' ? 'ตีกลับคำขอเบิก?' : 'ตีกลับบิลเคลียร์?';
    
    const { value: reason, isConfirmed } = await Swal.fire({
        title: titleText,
        html: `
            <div class="text-left text-sm mt-3 border-t border-gray-100 pt-3">
                <p class="text-gray-600 mb-2 text-xs">หัวข้อคำขอ: <span class="font-bold text-gray-800 text-sm">${purpose}</span></p>
                <div class="bg-red-50 p-3 rounded-xl border border-red-200 mt-2">
                    <p class="text-red-700 font-bold text-xs mb-1"><i data-lucide="alert-triangle" class="w-4 h-4 inline mb-0.5"></i> โปรดระบุเหตุผลเพื่อให้ผู้ขอแก้ไข:</p>
                </div>
            </div>
        `,
        input: 'textarea',
        inputPlaceholder: 'เช่น สลิปเบลอ, ยอดเงินไม่ตรง, กรุณาแนบใบเสร็จใหม่...',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ใช่, ตีกลับรายการ',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true,
        didOpen: () => { lucide.createIcons(); },
        inputValidator: (value) => {
            if (!value) return 'กรุณาระบุเหตุผลเพื่อให้ผู้ขอเบิกแก้ไข';
        }
    });

    if (!isConfirmed) return;

    const { error } = await supabaseClient.from('clearances').update({ 
        status: newStatus, 
        reject_reason: reason 
    }).eq('id', clearanceId);

    if (!error) { 
        Swal.fire('สำเร็จ', 'ตีกลับรายการพร้อมส่งเหตุผลให้สมาชิกแล้ว', 'success'); 
        fetchClearances(currentTab); 
        updateBadges(); 
    } else {
        Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    }
}

// ================= ฟังก์ชันเปิดหน้าต่างอนุมัติ ================= //
async function openApproveModal(clearanceId, amount, campId, mode, actualAmount = 0, purpose = '') {
    document.getElementById('approve-clearance-id').value = clearanceId;
    document.getElementById('approve-camp-id').value = campId;
    document.getElementById('approve-amount').value = amount;
    document.getElementById('approve-actual-amount').value = actualAmount;
    document.getElementById('approve-mode').value = mode;
    
    document.getElementById('approve-purpose-input').value = purpose;
    
    let displayAmount = amount;
    let titleText = '';
    const isIncome = mode === 'income' || mode === 'other_income';
    const diff = amount - actualAmount;

    if (isIncome) {
        titleText = 'ยืนยันการรับเงินเข้าบัญชี';
    } else if (mode === 'reconcile') {
        if (diff > 0) titleText = 'ยืนยันการรับเงินทอนคืน';
        else if (diff < 0) titleText = 'ยืนยันการโอนเงินส่วนเกินให้สมาชิก';
        displayAmount = Math.abs(diff);
    } else {
        titleText = 'ยืนยันการอนุมัติและโอนเงิน';
    }
    
    document.getElementById('approve-title-text').innerText = titleText;
    document.getElementById('approve-amount-display').innerText = parseFloat(displayAmount).toLocaleString('th-TH') + ' ฿';
    
    const slipSection = document.getElementById('admin-slip-upload-section');
    if (!isIncome && (mode === 'advance' || mode === 'reimburse' || mode === 'other_expense' || (mode === 'reconcile' && diff < 0))) {
        slipSection.classList.remove('hidden');
    } else {
        slipSection.classList.add('hidden');
    }

    const bankSelect = document.getElementById('approve-bank-select');
    const fundSelect = document.getElementById('approve-fund-select');
    bankSelect.innerHTML = '<option>กำลังโหลด...</option>';
    fundSelect.innerHTML = '<option>กำลังโหลด...</option>';

    const existingInfo = document.getElementById('approve-receive-bank-info');
    if (existingInfo) existingInfo.remove();

    const { data: cInfo } = await supabaseClient.from('clearances').select('receive_bank_name, receive_bank_account, receive_account_name').eq('id', clearanceId).single();
    
    if (!isIncome && cInfo && cInfo.receive_bank_account) {
        document.getElementById('approve-amount-display').parentNode.insertAdjacentHTML('afterend', `
            <div id="approve-receive-bank-info" class="bg-blue-50 p-3 rounded-xl border border-blue-100 mt-3 text-left shadow-sm">
                <p class="text-blue-800 font-bold text-xs mb-1"><i data-lucide="arrow-down-right" class="w-3.5 h-3.5 inline"></i> โอนเงินไปที่:</p>
                <p class="text-blue-700 font-bold text-sm">${cInfo.receive_bank_name} <span class="font-mono text-base ml-1 tracking-widest">${cInfo.receive_bank_account}</span></p>
                <p class="text-blue-700 text-xs mt-0.5">ชื่อบัญชี: ${cInfo.receive_account_name || 'ไม่ระบุ'}</p>
            </div>
        `);
    }

    document.getElementById('approve-modal').classList.remove('hidden');
    
    try {
        const { data: banks } = await supabaseClient.from('bank_accounts').select('*');
        const { data: funds } = await supabaseClient.from('funds').select('*');
        bankSelect.innerHTML = banks.map(b => `<option value="${b.id}" data-balance="${b.balance}">${b.name} (คงเหลือ: ${parseFloat(b.balance).toLocaleString()} ฿)</option>`).join('');
        fundSelect.innerHTML = funds.map(f => `<option value="${f.id}" data-balance="${f.balance}">${f.name} (คงเหลือ: ${parseFloat(f.balance).toLocaleString()} ฿)</option>`).join('');
    } catch (e) { console.error(e); }
}

function closeApproveModal() { document.getElementById('approve-modal').classList.add('hidden'); }

// 🌟 FIX: เก็บตัวแปร isProcessingApprove ไว้แค่ที่เดียว
let isProcessingApprove = false;

async function confirmApproval() {
    if (isProcessingApprove) return;
    
    const btn = document.getElementById('btn-confirm-approve');
    const clearanceId = document.getElementById('approve-clearance-id').value;
    const campId = document.getElementById('approve-camp-id').value;
    const mode = document.getElementById('approve-mode').value;
    const amount = parseFloat(document.getElementById('approve-amount').value);
    const actualAmount = parseFloat(document.getElementById('approve-actual-amount').value);
    
    const finalPurpose = document.getElementById('approve-purpose-input').value.trim();
    if (!finalPurpose) return Swal.fire('แจ้งเตือน', 'กรุณาระบุชื่อรายการ', 'warning');

    const bankSelect = document.getElementById('approve-bank-select');
    const fundSelect = document.getElementById('approve-fund-select');
    if (!bankSelect.value || !fundSelect.value) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบัญชีและกองทุน', 'warning');
    
    const bankName = bankSelect.options[bankSelect.selectedIndex].text.split('(')[0].trim();
    const fundName = fundSelect.options[fundSelect.selectedIndex].text.split('(')[0].trim();
    
    const isIncomeMode = mode === 'income' || mode === 'other_income';
    const diff = amount - actualAmount;
    
    const selectedBankOption = bankSelect.options[bankSelect.selectedIndex];
    const selectedFundOption = fundSelect.options[fundSelect.selectedIndex];
    const bankBalance = parseFloat(selectedBankOption.getAttribute('data-balance') || 0);
    const fundBalance = parseFloat(selectedFundOption.getAttribute('data-balance') || 0);
    
    const isExpenseMode = (!isIncomeMode && mode !== 'reconcile') || (mode === 'reconcile' && diff < 0);
    const requiredAmount = mode === 'reconcile' ? Math.abs(diff) : amount;
    
    if (isExpenseMode) {
        if (bankBalance < requiredAmount) {
            return Swal.fire('ยอดเงินไม่พอ', `บัญชี ${bankName} มีเงิน <b>${bankBalance.toLocaleString('th-TH')} ฿</b><br>แต่ต้องใช้ <b>${requiredAmount.toLocaleString('th-TH')} ฿</b>`, 'error');
        }
        if (fundBalance < requiredAmount) {
            return Swal.fire('ยอดเงินไม่พอ', `กองทุน ${fundName} มีเงิน <b>${fundBalance.toLocaleString('th-TH')} ฿</b><br>แต่ต้องใช้ <b>${requiredAmount.toLocaleString('th-TH')} ฿</b>`, 'error');
        }
    }

    let actionTitle = '';
    let warningHTML = '';
    let displayAmount = amount;
    
    if (isIncomeMode) {
        actionTitle = 'ยืนยันรับเงิน?';
        warningHTML = `<ul class="list-disc ml-5 space-y-1"><li>ยอดเงินจะเข้า <b class="text-green-600">บัญชีและกองทุนที่เลือก</b></li><li>คำขอเปลี่ยนเป็น <b>สำเร็จ (Cleared)</b></li></ul>`;
    } else if (mode === 'reconcile') {
        displayAmount = Math.abs(diff);
        if (diff > 0) {
            actionTitle = 'ยืนยันรับเงินทอน?';
            warningHTML = `<ul class="list-disc ml-5 space-y-1"><li>ยอดเงินส่วนต่างจะถูกบวกกลับ <b class="text-green-600">เข้าบัญชีกลาง</b></li><li>คำขอเปลี่ยนเป็น <b>สำเร็จ</b></li></ul>`;
        } else if (diff < 0) {
            actionTitle = 'ยืนยันโอนส่วนเกินให้สมาชิก?';
            warningHTML = `<ul class="list-disc ml-5 space-y-1"><li>ยอดเงินจะถูกหักออก <b class="text-red-600">จากบัญชีกลาง</b></li><li>โปรดอัปโหลดสลิปโอนเงิน</li></ul>`;
        } else {
            actionTitle = 'ยอดเบิกพอดี (ไม่มีส่วนต่าง)?';
            warningHTML = `<ul class="list-disc ml-5 space-y-1"><li>ไม่มียอดตัดบัญชี</li><li>คำขอเปลี่ยนเป็น <b>สำเร็จ</b></li></ul>`;
        }
    } else {
        actionTitle = 'ยืนยันอนุมัติและโอนเงิน?';
        warningHTML = `<ul class="list-disc ml-5 space-y-1"><li>เงินจะถูกหัก <b class="text-red-600">ออกจากระบบทันที</b></li><li>โปรดอัปโหลดสลิปที่โอนให้สมาชิก</li></ul>`;
    }

    const confirmResult = await Swal.fire({
        title: actionTitle,
        icon: 'info',
        html: `
            <div class="text-left text-sm mt-4 border-t border-gray-100 pt-4">
                <div class="mb-3 space-y-1.5">
                    <p class="text-gray-500">ยอดเงิน: <span class="${isIncomeMode || (mode==='reconcile' && diff>0) ? 'text-green-600' : (diff===0 && mode==='reconcile' ? 'text-gray-600' : 'text-blue-600')} font-extrabold text-lg">${displayAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</span></p>
                    <p class="text-gray-500">หัก/เข้า บัญชี: <span class="text-gray-800 font-bold">${bankName}</span></p>
                    <p class="text-gray-500">หัก/เข้า กองทุน: <span class="text-gray-800 font-bold">${fundName}</span></p>
                </div>
                <div class="bg-amber-50 p-3 rounded-xl border border-amber-200 mt-4">
                    <p class="text-amber-700 font-bold text-xs mb-1">ผลที่จะเกิดขึ้น:</p>
                    <div class="text-amber-700 text-xs">${warningHTML}</div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#ef4444',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (!confirmResult.isConfirmed) return;

    isProcessingApprove = true;
    btn.disabled = true; 
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 inline animate-spin"></i> กำลังประมวลผล...';
    lucide.createIcons();

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        let uploadedSlipUrl = null;
        if (!document.getElementById('admin-slip-upload-section').classList.contains('hidden')) {
            const fileInput = document.getElementById('admin-transfer-slip');
            if (fileInput.files.length === 0) throw new Error('กรุณาแนบสลิปการโอนเงิน');
            const file = fileInput.files[0];
            const ext = file.name.split('.').pop();
            const filePath = `admin_transfers/${Date.now()}.${ext}`;
            const { error: uploadError } = await supabaseClient.storage.from('receipts').upload(filePath, file);
            if (uploadError) throw uploadError;
            const { data } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
            uploadedSlipUrl = data.publicUrl;
        }
        
        if (isIncomeMode) {
            await supabaseClient.from('transactions').insert([{ camp_id: campId, bank_account_id: bankSelect.value, fund_id: fundSelect.value, amount: amount, transaction_type: 'income', description: finalPurpose, created_by: session.user.id, clearance_id: clearanceId }]);
            await supabaseClient.from('clearances').update({ status: 'cleared', purpose: finalPurpose }).eq('id', clearanceId);
        } else if (mode === 'reimburse' || mode === 'other_expense') {
            await supabaseClient.from('transactions').insert([{ camp_id: campId, bank_account_id: bankSelect.value, fund_id: fundSelect.value, amount: amount, transaction_type: 'expense', description: finalPurpose, created_by: session.user.id, clearance_id: clearanceId }]);
            await supabaseClient.from('clearances').update({ status: 'cleared', advance_slip_url: uploadedSlipUrl, actual_amount: amount, purpose: finalPurpose }).eq('id', clearanceId);
        } else if (mode === 'advance') {
            await supabaseClient.from('transactions').insert([{ camp_id: campId, bank_account_id: bankSelect.value, fund_id: fundSelect.value, amount: amount, transaction_type: 'expense', description: `โอนยืม: ${finalPurpose}`, created_by: session.user.id, clearance_id: clearanceId }]);
            await supabaseClient.from('clearances').update({ status: 'approved', advance_slip_url: uploadedSlipUrl, purpose: finalPurpose }).eq('id', clearanceId);
        } else if (mode === 'reconcile') {
            let payload = { status: 'cleared', purpose: finalPurpose };
            if (diff > 0) {
                await supabaseClient.from('transactions').insert([{ camp_id: campId, bank_account_id: bankSelect.value, fund_id: fundSelect.value, amount: diff, transaction_type: 'income', description: `รับเงินทอน: ${finalPurpose}`, created_by: session.user.id, clearance_id: clearanceId }]);
            } else if (diff < 0) {
                const absDiff = Math.abs(diff);
                await supabaseClient.from('transactions').insert([{ camp_id: campId, bank_account_id: bankSelect.value, fund_id: fundSelect.value, amount: absDiff, transaction_type: 'expense', description: `จ่ายส่วนเกิน: ${finalPurpose}`, created_by: session.user.id, clearance_id: clearanceId }]);
                payload.reimburse_slip_url = uploadedSlipUrl;
            }
            await supabaseClient.from('clearances').update(payload).eq('id', clearanceId);
        }

        await Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
        closeApproveModal();
        fetchClearances(currentTab);
        updateBadges();
        
    } catch (e) {
        Swal.fire('ข้อผิดพลาด', e.message, 'error');
    } finally {
        isProcessingApprove = false;
        btn.disabled = false; 
        btn.innerText = 'ยืนยันอนุมัติ';
    }
}

async function viewDetails(clearanceId) {
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('modal-content');
    const footer = document.getElementById('modal-footer');
    modal.classList.remove('hidden'); 
    content.innerHTML = '<div class="text-center py-6">กำลังโหลด...</div>';
    
    try {
        const { data: clearance } = await supabaseClient.from('clearances').select('*, profiles!user_id(full_name), camps(name)').eq('id', clearanceId).single();
        const { data: items } = await supabaseClient.from('clearance_items').select('*').eq('clearance_id', clearanceId);
        
        let itemsHTML = items.map((item, i) => `<div class="flex justify-between border-b py-2 text-sm"><span>${i+1}. ${item.description} (x${item.quantity})</span><b>${parseFloat(item.amount).toLocaleString()} ฿</b></div>`).join('');
        
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
            evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">ใบเสร็จ / สลิป (คลิกเพื่อดู)</p><div class="grid grid-cols-2 gap-2">`;
            evidenceHTML += receiptFiles.map(url => url.toLowerCase().includes('.pdf') 
                ? `<a href="${url}" target="_blank" class="p-2 bg-red-50 text-red-600 rounded text-[10px] font-bold border border-red-100 text-center flex flex-col items-center justify-center"><i data-lucide="file-text" class="w-4 h-4 mb-1"></i> ไฟล์ PDF</a>` 
                : `<a href="${url}" target="_blank" class="block rounded border border-gray-200 overflow-hidden"><img src="${url}" class="w-full h-24 object-cover"></a>`
            ).join('');
            evidenceHTML += `</div></div>`;
        }
        if (clearance.advance_slip_url) evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-blue-500 mb-1 uppercase tracking-wider">สลิปโอนเงินทดรอง (แอดมินโอน)</p><a href="${clearance.advance_slip_url}" target="_blank" class="block w-1/2 rounded border border-blue-200 overflow-hidden shadow-sm"><img src="${clearance.advance_slip_url}" class="w-full h-24 object-cover"></a></div>`;
        if (clearance.refund_slip_url) evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-green-500 mb-1 uppercase tracking-wider">สลิปเงินทอน (สมาชิกโอนคืน)</p><a href="${clearance.refund_slip_url}" target="_blank" class="block w-1/2 rounded border border-green-200 overflow-hidden shadow-sm"><img src="${clearance.refund_slip_url}" class="w-full h-24 object-cover"></a></div>`;
        if (clearance.reimburse_slip_url) evidenceHTML += `<div class="mb-3"><p class="text-[10px] font-bold text-purple-500 mb-1 uppercase tracking-wider">สลิปโอนเงินเบิกคืน (แอดมินโอน)</p><a href="${clearance.reimburse_slip_url}" target="_blank" class="block w-1/2 rounded border border-purple-200 overflow-hidden shadow-sm"><img src="${clearance.reimburse_slip_url}" class="w-full h-24 object-cover"></a></div>`;

        const applicantName = clearance.unregistered_name || clearance.profiles?.full_name || 'ไม่ระบุชื่อ';

        let receiveBankHTML = '';
        if (clearance.receive_bank_name && clearance.receive_bank_account) {
            receiveBankHTML = `
            <div class="bg-blue-50 p-3 rounded-xl mt-3 border border-blue-100 shadow-sm text-sm">
                <p class="font-bold text-blue-800 border-b border-blue-200 pb-1 mb-2"><i data-lucide="landmark" class="w-4 h-4 inline"></i> บัญชีผู้รับเงิน (โอนเข้าบัญชีนี้)</p>
                <p class="text-blue-700">ธนาคาร: <b>${clearance.receive_bank_name}</b></p>
                <p class="text-blue-700">เลขบัญชี: <b class="font-mono text-base tracking-wider">${clearance.receive_bank_account}</b></p>
                <p class="text-blue-700">ชื่อบัญชี: <b>${clearance.receive_account_name || '-'}</b></p>
            </div>`;
        }
            
        // 🌟 FIX: จัดการโค้ด content.innerHTML ให้เหลือบล็อคเดียว ป้องกันการซ้อนทับกัน
        content.innerHTML = `
            <div class="space-y-2">
                <p><b>ชื่อผู้เบิก:</b> ${applicantName}</p>
                <p><b>โครงการ:</b> ${clearance.camps?.name || 'ไม่ระบุ'}</p>
                <p><b>หัวข้อ:</b> ${clearance.purpose}</p>
                ${receiveBankHTML}
                <div class="bg-gray-50 p-3 rounded-xl mt-3">
                    <p class="font-bold border-b pb-1 mb-2">รายการที่ขอเบิก</p>
                    ${itemsHTML || '<p class="text-gray-400">ไม่มีรายการ</p>'}
                </div>
                <div class="pt-2 mt-4 border-t border-gray-100">
                    <p class="text-xs font-bold text-gray-700 mb-2 mt-2">หลักฐานใบเสร็จ / สลิป</p>
                    ${evidenceHTML || '<p class="text-xs text-gray-400">ไม่พบหลักฐาน</p>'}
                </div>
            </div>`;
            
        let registerBtnHTML = '';
        if ((clearance.status === 'cleared' || clearance.status === 'approved' || clearance.status === 'advance_transferred') && receiptFiles.length > 0) {
            registerBtnHTML = `<button onclick="registerDocument('${clearance.id}')" class="w-full bg-emerald-600 text-white font-bold py-2.5 rounded-xl shadow-sm hover:bg-emerald-700 transition flex items-center justify-center gap-2"><i data-lucide="archive" class="w-4 h-4"></i> นำเข้าทะเบียนเอกสาร</button>`;
        }

        footer.innerHTML = `
            ${registerBtnHTML}
            <button onclick="closeModal()" class="w-full bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl font-bold hover:bg-gray-50 transition flex items-center justify-center">ปิดหน้าต่าง</button>
        `;
        lucide.createIcons();
    } catch(e) { 
        content.innerHTML = `<p class="text-red-500">${e.message}</p>`; 
    }
}

function closeModal() { document.getElementById('details-modal').classList.add('hidden'); }
function openManageCampsModal() { document.getElementById('manage-camps-modal').classList.remove('hidden'); fetchCampsList(); }
function closeManageCampsModal() { document.getElementById('manage-camps-modal').classList.add('hidden'); }

async function fetchCampsList() {
    const container = document.getElementById('camps-list-container');
    container.innerHTML = '<div class="text-center py-4 text-gray-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>';
    lucide.createIcons();
    
    try {
        const { data: camps, error } = await supabaseClient.from('camps').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        
        container.innerHTML = camps.map(camp => `
            <div class="flex items-center justify-between p-3.5 bg-white border ${camp.is_active ? 'border-purple-300 bg-purple-50/50' : 'border-gray-100'} rounded-xl shadow-sm transition-all">
                <div class="flex-grow pr-2">
                    <p class="font-bold text-gray-800 text-sm ${camp.is_active ? 'text-purple-700' : ''}">${camp.name} <span class="text-xs text-gray-400 font-normal">(ปี ${camp.academic_year || '-'})</span></p>
                    ${camp.is_active ? '<span class="text-[9px] bg-purple-200 text-purple-700 px-2 py-0.5 rounded font-bold mt-1 inline-block">โครงการปัจจุบัน (Active)</span>' : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    ${!camp.is_active ? `
                        <button onclick="setActiveCamp('${camp.id}', '${camp.name}')" class="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="ตั้งเป็นโครงการปัจจุบัน">
                            <i data-lucide="check-circle" class="w-4 h-4"></i>
                        </button>
                    ` : ''}
                    <button onclick="editCampName('${camp.id}', '${camp.name}', '${camp.academic_year}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="แก้ไขชื่อโครงการ">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    ${!camp.is_active ? `
                        <button onclick="deleteCamp('${camp.id}', '${camp.name}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="ลบโครงการ">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    ` : `
                        <button class="p-2 text-gray-300 cursor-not-allowed" disabled title="ไม่สามารถลบโครงการปัจจุบันได้">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    `}
                </div>
            </div>`).join('');
            
        lucide.createIcons();
    } catch (err) { 
        container.innerHTML = `<p class="text-red-500 text-xs text-center py-4">เกิดข้อผิดพลาด: ${err.message}</p>`; 
    }
}

async function editCampName(campId, currentName, currentYear) {
    const { value: formValues } = await Swal.fire({
        title: 'แก้ไขข้อมูลโครงการ',
        html:
            `<input id="swal-input-name" class="swal2-input text-base font-bold" value="${currentName}" placeholder="ชื่อโครงการ">` +
            `<input id="swal-input-year" type="number" class="swal2-input text-center text-sm" value="${currentYear}" placeholder="ปีการศึกษา">`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'บันทึกแก้ไข',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            return [
                document.getElementById('swal-input-name').value.trim(),
                document.getElementById('swal-input-year').value.trim()
            ]
        }
    });

    if (formValues && formValues[0]) {
        try {
            const { error } = await supabaseClient.from('camps').update({ name: formValues[0], academic_year: formValues[1] }).eq('id', campId);
            if (error) throw error;
            Swal.fire('สำเร็จ', 'แก้ไขข้อมูลโครงการเรียบร้อยแล้ว', 'success');
            fetchCampsList();
        } catch (err) { Swal.fire('ล้มเหลว', err.message, 'error'); }
    }
}

async function deleteCamp(campId, campName) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบโครงการ?',
        icon: 'warning',
        html: `
            <div class="text-left text-sm mt-3 border-t border-gray-100 pt-3">
                <p class="text-gray-700">คุณกำลังจะลบโครงการ: <br><span class="font-extrabold text-red-600 text-lg">${campName}</span></p>
                <div class="bg-red-50 p-3 rounded-xl border border-red-200 mt-3">
                    <p class="text-red-700 font-bold text-xs mb-1">⚠️ คำเตือนขั้นสูงสุด:</p>
                    <ul class="list-disc ml-5 text-red-600 text-xs space-y-1">
                        <li>ข้อมูลประวัติการเบิกจ่ายทั้งหมดที่ผูกกับค่ายนี้จะถูก <b>ลบทิ้งถาวร</b></li>
                        <li>กองทุนย่อยในค่ายนี้จะถูก <b>ลบทิ้งถาวร</b></li>
                        <li>ไม่สามารถย้อนกลับหรือกู้คืนได้</li>
                    </ul>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'ยืนยันลบถาวร',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (result.isConfirmed) {
        try {
            const { error } = await supabaseClient.from('camps').delete().eq('id', campId);
            if (error) throw error;
            Swal.fire('ลบสำเร็จ', 'ลบโครงการและข้อมูลที่เกี่ยวข้องออกจากระบบแล้ว', 'success');
            fetchCampsList();
        } catch (err) { Swal.fire('ข้อผิดพลาด', 'ไม่สามารถลบได้เนื่องจากติดเงื่อนไขฐานข้อมูล: ' + err.message, 'error'); }
    }
}

async function setActiveCamp(targetId, campName) {
    const result = await Swal.fire({
        title: 'สลับโครงการปัจจุบัน?',
        icon: 'question',
        html: `
            <div class="text-left text-sm mt-3 border-t border-gray-100 pt-3">
                <p class="text-gray-600">สลับการทำงานไปยังโครงการ:</p>
                <p class="font-extrabold text-purple-700 text-lg mb-3">${campName}</p>
                <div class="bg-purple-50 p-3 rounded-xl border border-purple-200">
                    <p class="text-purple-800 font-bold text-xs mb-1">💡 สิ่งที่จะเกิดขึ้น:</p>
                    <ul class="list-disc ml-5 text-purple-700 text-[11px] space-y-1">
                        <li>หน้าแรกของ <b>สมาชิกทุกคน</b> จะถูกเปลี่ยนมาที่ค่ายนี้ทันที</li>
                        <li>การส่งคำขอเบิกเงินและเงินบริจาคใหม่จะถูกผูกเข้าค่ายนี้อัตโนมัติ</li>
                    </ul>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#7e22ce',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ใช่, สลับโครงการเลย',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังสลับโครงการ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
        const { data: activeCamps, error: fetchError } = await supabaseClient.from('camps').select('id').eq('is_active', true);
        if (fetchError) throw fetchError;

        if (activeCamps && activeCamps.length > 0) {
            const { error: updateFalseError } = await supabaseClient.from('camps').update({ is_active: false }).in('id', activeCamps.map(c => c.id));
            if (updateFalseError) throw updateFalseError;
        }

        const { error: updateTrueError } = await supabaseClient.from('camps').update({ is_active: true }).eq('id', targetId);
        if (updateTrueError) throw updateTrueError;

        await Swal.fire('สำเร็จ', 'สลับหน้าบ้านไปยังโครงการใหม่เรียบร้อยแล้ว', 'success');
        fetchCampsList();
        if (typeof fetchClearances === 'function') fetchClearances(currentTab);
        if (typeof updateBadges === 'function') updateBadges();
    } catch (err) {
        console.error("Set Active Camp Error:", err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถสลับโครงการได้: ' + err.message, 'error');
    }
}

async function handleAddCamp(e) {
    e.preventDefault();
    
    const nameInput = document.getElementById('new-camp-name').value.trim();
    const yearInput = document.getElementById('new-camp-year').value.trim();
    
    if (!nameInput) return Swal.fire('แจ้งเตือน', 'กรุณาระบุชื่อโครงการ', 'warning');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 inline animate-spin"></i>...';
    lucide.createIcons();

    try {
        const { error } = await supabaseClient.from('camps').insert({ 
            name: nameInput, 
            academic_year: yearInput || null, 
            is_active: false 
        });
        
        if (error) throw error;
        
        await Swal.fire({
            title: 'สำเร็จ!',
            text: 'เพิ่มโครงการใหม่ลงในระบบเรียบร้อยแล้ว',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });
        
        document.getElementById('add-camp-form').reset(); 
        fetchCampsList(); 
        
    } catch (err) {
        console.error("Add Camp Error:", err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเพิ่มโครงการได้: ' + err.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
}

function toggleAdminActionMenu() {
    const overlay = document.getElementById('admin-action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

function handleManageCampsClick() {
    toggleAdminActionMenu();
    if (typeof openManageCampsModal === 'function') { openManageCampsModal(); } 
    else { window.location.href = 'dashboard.html?manage=camps'; }
}

async function loadAnalytics() {
    try {
        const { data: camp } = await supabaseClient.from('camps').select('id').eq('is_active', true).single();
        if (!camp) return;

        const { data: clearances, error } = await supabaseClient
            .from('clearances')
            .select('request_type, actual_amount, total_amount, created_at')
            .eq('camp_id', camp.id)
            .eq('status', 'cleared');

        if (error) {
            console.error("Supabase Analytics Error:", error);
            return;
        }

        const safeClearances = clearances || [];
        let totalIncome = 0;
        let totalExpense = 0;
        
        let dailyExpensesMap = {};

        safeClearances.forEach(doc => {
            const amt = parseFloat(doc.actual_amount || doc.total_amount || 0);
            
            if (doc.request_type === 'income' || doc.request_type === 'other_income') {
                totalIncome += amt;
            } else {
                totalExpense += amt;
                
                const dateObj = new Date(doc.created_at);
                const isoDate = dateObj.toISOString().split('T')[0];
                
                if (!dailyExpensesMap[isoDate]) dailyExpensesMap[isoDate] = 0;
                dailyExpensesMap[isoDate] += amt;
            }
        });

        const budgetText = document.getElementById('budget-text');
        const budgetProgress = document.getElementById('budget-progress');
        
        if (budgetText && budgetProgress) {
            budgetText.innerText = `${totalExpense.toLocaleString('th-TH')} / ${totalIncome.toLocaleString('th-TH')} ฿`;
            const percent = totalIncome > 0 ? Math.min((totalExpense / totalIncome) * 100, 100) : 0;
            budgetProgress.style.width = `${percent}%`;
            
            if (percent >= 80) {
                budgetProgress.classList.replace('bg-blue-600', 'bg-red-500');
                budgetText.classList.replace('text-blue-600', 'text-red-600');
            }
        }

        const sortedDates = Object.keys(dailyExpensesMap).sort();
        let chartLabels = [];
        let chartData = [];

        sortedDates.forEach(dateStr => {
            const d = new Date(dateStr);
            chartLabels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
            chartData.push(dailyExpensesMap[dateStr]);
        });

        if (chartData.length === 0) {
            chartLabels = ['ยังไม่มีข้อมูล'];
            chartData = [0];
        }

        const ctx = document.getElementById('expenseChart');
        if (ctx) {
            if (window.myDonutChart) window.myDonutChart.destroy();
            
            window.myDonutChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'ยอดใช้จ่าย (บาท)',
                        data: chartData,
                        borderColor: '#3b82f6', 
                        backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                        borderWidth: 2,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        fill: true, 
                        tension: 0.4 
                    }]
                },
                options: {
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { 
                            callbacks: { 
                                label: (ctx) => ` จ่ายไป ${ctx.raw.toLocaleString('th-TH')} ฿` 
                            } 
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false } 
                        },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value.toLocaleString('th-TH'); 
                                }
                            }
                        }
                    }
                }
            });
        }

    } catch (err) {
        console.error("Analytics Error ยืนยันแล้ว:", err);
    }
}

window.logout = async function() {
    Swal.fire({
        title: 'ต้องการออกจากระบบ?',
        text: "คุณแน่ใจหรือไม่ที่จะออกจากระบบหลังบ้าน (Admin)",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444', 
        cancelButtonColor: '#9ca3af', 
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ 
                title: 'กำลังออกจากระบบ...', 
                allowOutsideClick: false, 
                didOpen: () => { Swal.showLoading(); } 
            });
            
            try {
                await supabaseClient.auth.signOut();
                window.location.href = '../index.html';
            } catch (err) {
                Swal.fire('ข้อผิดพลาด', 'ไม่สามารถออกจากระบบได้: ' + err.message, 'error');
            }
        }
    });
};


// ================= ระบบนำเข้าทะเบียนเอกสาร (Sarabun Auto-Registry) ================= //
const SARABUN_API_URL = 'https://script.google.com/macros/s/AKfycbyoXeyrhWpF2W7PMq3R7P_-XzOVCgvFmt3HaQ9qhdiqRYJ72z6HLKhk8wCnuLefC906/exec';

window.registerDocument = async function(clearanceId) {
    const { data: clearance } = await supabaseClient.from('clearances').select('*').eq('id', clearanceId).single();
    if(!clearance) return;
    
    let receiptFiles = [];
    if (clearance.receipt_image_url) {
        try {
            const parsed = JSON.parse(clearance.receipt_image_url);
            if (Array.isArray(parsed)) receiptFiles = parsed;
            else receiptFiles = [clearance.receipt_image_url];
        } catch (e) { receiptFiles = [clearance.receipt_image_url]; }
    }
    
    if(receiptFiles.length === 0) return Swal.fire('ไม่พบเอกสาร', 'ไม่มีไฟล์รูปภาพให้ลงทะเบียน', 'error');

    const fileUrl = receiptFiles[0]; 

    const { value: formValues } = await Swal.fire({
        title: 'นำเข้าทะเบียนเอกสาร',
        html: `
            <div class="text-left text-sm mt-2">
                <img src="${fileUrl}" class="w-full h-32 object-cover rounded-lg mb-3 border border-gray-200">
                <label class="block font-bold text-gray-700 mb-1">ชื่อเอกสาร</label>
                <input id="swal-doc-title" class="swal2-input !m-0 !w-full !text-sm mb-3 border-gray-200" value="${clearance.purpose}">
                
                <label class="block font-bold text-gray-700 mb-1">สถานที่จัดเก็บตัวจริง <span class="text-red-500">*</span></label>
                <select id="swal-doc-location" class="swal2-select !m-0 !w-full !text-sm border-gray-200 font-medium">
                    <option value="ห้องค่าย_ตู้ชั้นหนึ่ง">ห้องค่าย_ตู้ชั้นหนึ่ง</option>
                    <option value="ห้องค่าย_ตู้ชั้นสอง">ห้องค่าย_ตู้ชั้นสอง</option>
                    <option value="อยู่ที่อุ้มรัก">อยู่ที่อุ้มรัก</option>
                    <option value="อยู่ที่วิน">อยู่ที่วิน</option>
                    <option value="อยู่ที่เลขาฯ" selected>อยู่ที่เลขาฯ</option>
                    <option value="อยู่ที่ฝ่ายอื่น">อยู่ที่ฝ่ายอื่น</option>
                    <option value="หาย">หาย</option>
                    <option value="ส่งแล้ว">ส่งแล้ว</option>
                </select>
            </div>
        `,
        focusConfirm: false, showCancelButton: true, confirmButtonColor: '#059669', cancelButtonColor: '#9ca3af', confirmButtonText: 'บันทึกเข้าระบบ', cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const title = document.getElementById('swal-doc-title').value.trim();
            const location = document.getElementById('swal-doc-location').value.trim();
            if(!location) Swal.showValidationMessage('กรุณาระบุสถานที่จัดเก็บตัวจริง');
            return { title, location };
        }
    });

    if (formValues) {
        Swal.fire({title: 'กำลังลงทะเบียนสารบรรณ...', html: 'ระบบกำลังดึงรูปและจัดเก็บลง Google Drive...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        
        try {
            if (!SARABUN_API_URL || SARABUN_API_URL.includes('ใส่_URL_')) throw new Error("ยังไม่ได้ใส่ URL ของ API สารบรรณ");

            const response = await fetch(SARABUN_API_URL, {
                method: 'POST',
                body: JSON.stringify({
                    imageUrl: fileUrl,
                    department: clearance.department,
                    docName: formValues.title,
                    location: formValues.location
                }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error);

            Swal.fire({
                icon: 'success',
                title: 'ลงทะเบียนสำเร็จ!',
                html: `รหัสเอกสาร: <b class="text-emerald-600">${result.runningNumber}</b><br>ข้อมูลถูกส่งเข้า Google Sheets เรียบร้อยแล้ว`
            });
            
            closeModal();
        } catch(e) {
            Swal.fire('ข้อผิดพลาด', e.message, 'error');
        }
    }
}

// ================= ระบบยกเลิกรายการ (Void) ================= //
window.voidRequest = async function(clearanceId) {
    const confirmResult = await Swal.fire({
        title: 'ยกเลิกการอนุมัติ (Void)?',
        text: "หากยกเลิก สถานะจะถูกดึงกลับมาเป็น 'ตีกลับ' และยอดเงินจะถูกคืนกลับเข้าบัญชีกลาง/กองทุนอัตโนมัติ",
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ใช่, ยกเลิกรายการนี้',
        cancelButtonText: 'ปิด',
        reverseButtons: true
    });

    if (confirmResult.isConfirmed) {
        Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        try {
            const { error } = await supabaseClient
                .from('clearances')
                .update({ 
                    status: 'rejected',
                    reject_reason: 'แอดมินยกเลิกการอนุมัติ (Void): เกิดข้อผิดพลาดในการตรวจสอบ โปรดแก้ไขและส่งใหม่' 
                })
                .eq('id', clearanceId);

            if (error) throw error;
            
            await supabaseClient.from('transactions').delete().eq('clearance_id', clearanceId);
            
            await Swal.fire('ยกเลิกสำเร็จ!', 'รายการนี้ถูก Void และคืนยอดเงินกลับเข้าสู่ระบบแล้ว', 'success');
            
            fetchClearances(currentTab);
            updateBadges();
            if (typeof loadAnalytics === 'function') loadAnalytics(); 
        } catch (err) {
            Swal.fire('ข้อผิดพลาด', err.message, 'error');
        }
    }
}