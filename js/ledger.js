// js/ledger.js

let currentLedgerView = 'main';
let cachedProfileName = 'ไม่ระบุชื่อ';
let allCamps = [];

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            cachedProfileName = profile.full_name || 'ไม่ระบุชื่อ';
            if (profile.role === 'admin') {
                const adminLink = document.getElementById('admin-action-link');
                if (adminLink) adminLink.classList.remove('hidden');
            }
        }
    }

    await loadCampsForLedger();
    fetchGlobalBanks();
    fetchLedgerTransactions();
});

// ================= ระบบแท็บและการแสดงผล ================= //

async function loadCampsForLedger() {
    const campSelect = document.getElementById('camp-filter');
    try {
        const { data: camps, error } = await supabaseClient.from('camps').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        allCamps = camps || [];
        if (allCamps.length > 0) {
            // 🌟 เพิ่มตัวเลือก "ดูรวมทั้งหมด (Overview)" เข้าไปเป็นตัวเลือกแรก
            let optionsHTML = '<option value="all" class="font-bold text-blue-600">🌎 ดูรวมทั้งหมด (Overview)</option>';
            
            optionsHTML += allCamps.map(c => 
                `<option value="${c.id}" ${c.is_active ? 'selected' : ''}>${c.name} ${c.is_active ? '(ปัจจุบัน)' : ''}</option>`
            ).join('');
            
            campSelect.innerHTML = optionsHTML;
        } else {
            campSelect.innerHTML = '<option value="">ไม่มีข้อมูลโครงการ</option>';
        }
    } catch (e) { console.error("Load camps error:", e); }
}

window.switchLedgerTab = function(tabType) {
    currentLedgerView = tabType;
    const btnMain = document.getElementById('tab-main');
    const btnProject = document.getElementById('tab-project');
    const exportDiv = document.getElementById('project-export-actions');
    const filtersDiv = document.getElementById('ledger-filters');
    const banksDiv = document.getElementById('global-banks-container');
    
    if(tabType === 'main') {
        btnMain.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-emerald-600 shadow-sm border border-gray-100 transition-all";
        btnProject.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all";
        if(exportDiv) exportDiv.classList.add('hidden');
        if(filtersDiv) filtersDiv.classList.add('hidden'); 
        if(banksDiv) banksDiv.classList.remove('hidden');  
    } else {
        btnProject.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-emerald-600 shadow-sm border border-gray-100 transition-all";
        btnMain.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all";
        if(exportDiv) exportDiv.classList.remove('hidden');
        if(filtersDiv) filtersDiv.classList.remove('hidden'); 
        if(banksDiv) banksDiv.classList.add('hidden'); 
    }
    fetchLedgerTransactions();
};

window.handleFilterChange = function() { fetchLedgerTransactions(); };

function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

// ================= โหลดข้อมูลสมุดบัญชีหน้าเว็บ ================= //

async function fetchGlobalBanks() {
    const container = document.getElementById('global-banks-container');
    try {
        const { data: banks, error } = await supabaseClient.from('bank_accounts').select('*');
        if (error) throw error;
        if (!banks || banks.length === 0) {
            container.innerHTML = '<div class="text-center py-5 text-gray-400">ยังไม่มีข้อมูลบัญชี</div>';
            return;
        }
        container.innerHTML = banks.map(b => {
            const hexColor = b.color || '#3B82F6'; 
            return `
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div class="w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0" style="background-color: ${hexColor}15; border-color: ${hexColor}30; color: ${hexColor};">
                    <i data-lucide="building" class="w-6 h-6"></i>
                </div>
                <div>
                    <p class="text-[10px] text-gray-500 font-bold uppercase">${b.name}</p>
                    <p class="font-extrabold text-lg" style="color: ${hexColor};">${parseFloat(b.balance).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                </div>
            </div>`;
        }).join('');
        lucide.createIcons();
    } catch (err) { console.error(err); }
}

async function fetchLedgerTransactions() {
    const container = document.getElementById('ledger-container');
    container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400">กำลังโหลดรายการ...</td></tr>`;
    try {
        let query = supabaseClient.from('transactions').select(`*, clearances (purpose, department)`).order('created_at', { ascending: false });
        let selectedDept = 'all';
        
        if (currentLedgerView === 'project') {
            const selectedCampId = document.getElementById('camp-filter')?.value;
            selectedDept = document.getElementById('dept-filter')?.value || 'all';
            
            // 🌟 ดักเงื่อนไข: ถ้าไม่ได้เลือก "ดูรวมทั้งหมด (all)" ให้ดึงเฉพาะโครงการนั้น
            if (selectedCampId && selectedCampId !== 'all') {
                query = query.eq('camp_id', selectedCampId);
            }
        }
        
        const { data: trans, error } = await query;
        if (error) throw error;

        let filteredTrans = trans;
        if (currentLedgerView === 'project' && selectedDept !== 'all') {
            filteredTrans = trans.filter(t => t.clearances && t.clearances.department === selectedDept);
        }

        if (!filteredTrans || filteredTrans.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400 text-xs">ไม่มีรายการบันทึก</td></tr>`;
            return;
        }

        container.innerHTML = filteredTrans.map(t => {
            const isIncome = t.transaction_type === 'income'; 
            const dept = t.clearances?.department || '-';
            const purpose = t.clearances?.purpose || t.description || 'รายการเบิกจ่าย';
            let typeLabel = isIncome ? "เงินเข้า" : "เบิกจ่าย";
            if (t.description.includes('อนุมัติเบิกจ่าย')) typeLabel = "อนุมัติเบิก";
            else if (t.description.includes('รับเงินทอนคืน')) typeLabel = "รับคืนส่วนต่าง";
            
            const targetId = t.clearance_id ? `'${t.clearance_id}'` : null;
            return `
            <tr class="hover:bg-gray-50 border-b border-gray-50">
                <td class="p-4 text-xs text-gray-500">${new Date(t.created_at).toLocaleDateString('th-TH')}</td>
                <td class="p-4"><div class="text-xs font-bold text-gray-800">[${typeLabel}] ${cleanText(purpose)}</div></td>
                <td class="p-4 text-xs text-gray-600 font-bold">${dept}</td>
                <td class="p-4 text-right font-bold text-emerald-600 text-xs">${isIncome ? '+' + parseFloat(t.amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
                <td class="p-4 text-right font-bold text-rose-600 text-xs">${!isIncome ? '-' + parseFloat(t.amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
                <td class="p-4 text-center">
                    ${targetId ? `<button onclick="viewLedgerDetails(${targetId})" class="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg border border-blue-100"><i data-lucide="eye" class="w-4 h-4"></i></button>` : `-`}
                </td>
            </tr>`;
        }).join('');
        lucide.createIcons();
    } catch (err) { container.innerHTML = `<tr><td colspan="6" class="text-center text-red-500">${err.message}</td></tr>`; }
}

window.viewLedgerDetails = async function(clearanceId) {
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('modal-content');
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="text-center py-10 text-gray-400">กำลังโหลด...</div>';
    
    try {
        const { data: clearance } = await supabaseClient.from('clearances').select('*, profiles!user_id(full_name), camps(name)').eq('id', clearanceId).single();
        const { data: items } = await supabaseClient.from('clearance_items').select('*').eq('clearance_id', clearanceId);
        
        let itemsHTML = (items || []).map((item, i) => `<div class="flex justify-between text-xs py-1"><span>${i+1}. ${item.description}</span><span class="font-bold">${parseFloat(item.amount).toLocaleString('th-TH')} ฿</span></div>`).join('');
        
        content.innerHTML = `
            <div class="space-y-2 pb-4 border-b">
                <p class="text-xs text-gray-500">โครงการ: <b>${clearance.camps?.name || 'ทั่วไป'}</b></p>
                <p class="text-xs text-gray-500">หัวข้อ: <b class="text-gray-800">${cleanText(clearance.purpose)}</b></p>
            </div>
            <div class="mt-4">
                <p class="text-xs font-bold text-gray-500 mb-2">รายการที่เบิก</p>
                ${itemsHTML}
                <div class="text-right mt-3"><p class="text-xl font-bold text-blue-600">${parseFloat(clearance.total_amount).toLocaleString('th-TH')} ฿</p></div>
            </div>
        `;
    } catch(err) { content.innerHTML = `<p class="text-red-500 text-center">${err.message}</p>`; }
};
window.closeModal = function() { document.getElementById('details-modal').classList.add('hidden'); };

// ================= ระบบจัดเตรียมข้อมูล Report ================= //

function cleanText(text) {
    if (!text) return '';
    let plainText = text.replace(/<[^>]*>?/gm, ''); 
    return plainText.split('|')[0].trim(); 
}

function formatMoney(amount) {
    if (!amount && amount !== 0) return '';
    const num = parseFloat(amount);
    if (num === 0) return '-';
    return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNet(amount) {
    const num = parseFloat(amount);
    if (num === 0) return '-';
    if (num < 0) return `(${Math.abs(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    return num.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getReportData() {
    const selectedCampId = document.getElementById('camp-filter').value;
    if (!selectedCampId) throw new Error("กรุณาเลือกโครงการ");
    
    let campNameForReport = 'รวมทั้งหมด (ภาพรวม)';
    let query = supabaseClient.from('clearances').select('*, camps(name)').eq('status', 'cleared');
    
    // 🌟 ถ้าไม่ได้เลือก "all" ค่อยฟิลเตอร์ตาม ID
    if (selectedCampId !== 'all') {
        const camp = allCamps.find(c => c.id === selectedCampId);
        if (camp) campNameForReport = camp.name;
        query = query.eq('camp_id', selectedCampId);
    }
    
    const { data: clearances } = await query;
    const safeClearances = clearances || [];

    let totalIncome = 0;
    let totalExpense = 0;
    let departmentsData = {};
    let generalIncomes = [];

    safeClearances.forEach(c => {
        const isInc = c.request_type === 'income' || c.request_type === 'other_income';
        const amt = parseFloat(c.actual_amount || c.total_amount || 0);
        
        // ถ้ารวมหลายโครงการ ให้เอาชื่อโครงการแปะนำหน้า purpose ด้วย
        const campPrefix = (selectedCampId === 'all' && c.camps) ? `[${c.camps.name}] ` : '';
        const purpose = campPrefix + cleanText(c.purpose);
        
        const dept = c.department || 'ทั่วไป';

        if (isInc) {
            totalIncome += amt;
            if (dept !== 'ส่วนกลาง' && dept !== 'ทั่วไป') {
                if(!departmentsData[dept]) departmentsData[dept] = { items: [], inc: 0, exp: 0 };
                departmentsData[dept].items.push({ name: purpose, inc: amt, exp: 0 });
                departmentsData[dept].inc += amt;
            } else {
                generalIncomes.push({ name: purpose, amt: amt });
            }
        } else {
            totalExpense += amt;
            let targetDept = dept === 'ส่วนกลาง' ? 'รายจ่ายส่วนกลาง' : dept;
            if(!departmentsData[targetDept]) departmentsData[targetDept] = { items: [], inc: 0, exp: 0 };
            departmentsData[targetDept].items.push({ name: purpose, inc: 0, exp: amt });
            departmentsData[targetDept].exp += amt;
        }
    });

    return { camp: { name: campNameForReport }, generalIncomes, departmentsData, totalIncome, totalExpense, net: totalIncome - totalExpense };
}

// ================= ระบบสร้าง PDF (Preview และ Absolute DOM Injection) ================= //

window.exportPDF = async function() {
    try {
        const data = await getReportData();
        
        const { value: formValues, isConfirmed } = await Swal.fire({
            title: 'ตั้งค่ารายการสรุป',
            html: `
                <div class="text-left mb-3 pb-3 border-b border-gray-100">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="swal-show-extended" class="w-5 h-5 accent-emerald-600 cursor-pointer" checked>
                        <span class="font-bold text-gray-800 text-sm">แสดงข้อมูลสรุปบัญชีเชิงลึก</span>
                    </label>
                </div>
                <div id="extended-inputs" class="text-left space-y-3 mt-4 text-sm transition-all duration-300">
                    <div><label class="block font-bold text-gray-700 mb-1">รายรับค้างรับ (บาท)</label><input id="swal-pending-inc" type="number" class="w-full border border-gray-300 rounded-lg p-2" value="0"></div>
                    <div><label class="block font-bold text-gray-700 mb-1">เงินค่ายยกยอดมา (บาท)</label><input id="swal-brought-fwd" type="number" class="w-full border border-gray-300 rounded-lg p-2" value="0"></div>
                    <div><label class="block font-bold text-gray-700 mb-1">หนี้ค้างจ่าย (บาท)</label><input id="swal-pending-exp" type="number" class="w-full border border-gray-300 rounded-lg p-2" value="0"></div>
                    <div><label class="block font-bold text-gray-700 mb-1 text-blue-600">เงินค่ายคงเหลือจริง (บาท)</label><input id="swal-actual-balance" type="number" class="w-full border border-blue-300 bg-blue-50 rounded-lg p-2" value="0"></div>
                </div>
            `,
            didOpen: () => {
                const checkbox = document.getElementById('swal-show-extended');
                const extendedInputs = document.getElementById('extended-inputs');
                checkbox.addEventListener('change', (e) => {
                    extendedInputs.style.display = e.target.checked ? 'block' : 'none';
                });
            },
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'ดูตัวอย่าง',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#059669',
            preConfirm: () => {
                return {
                    showExtended: document.getElementById('swal-show-extended').checked,
                    pendingInc: parseFloat(document.getElementById('swal-pending-inc').value) || 0,
                    broughtFwd: parseFloat(document.getElementById('swal-brought-fwd').value) || 0,
                    pendingExp: parseFloat(document.getElementById('swal-pending-exp').value) || 0,
                    actualBalance: parseFloat(document.getElementById('swal-actual-balance').value) || 0
                }
            }
        });

        if (!isConfirmed) return;

        Swal.fire({ title: 'กำลังโหลดตัวอย่าง...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        const dateStr = new Date().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute:'2-digit' });
        
        const totalIncSum = data.totalIncome + formValues.pendingInc;
        const totalExpSum = data.totalExpense;
        const accountingBalance = formValues.broughtFwd + data.net - formValues.pendingExp;
        
        let innerHtmlStr = `
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                .pdf-inner-wrapper { font-family: 'Sarabun', sans-serif; font-size: 14px; color: #000; text-align: left; }
                .pdf-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
                .pdf-th { text-align: right; padding: 8px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
                .pdf-td { padding: 4px 0; }
                .pdf-td-num { text-align: right; padding: 4px 0; }
            </style>
            
            <div class="pdf-inner-wrapper">
                <div style="text-align: center; margin-bottom: 30px;">
                    <img src="../images/arsatu_ls.png" style="width: 140px; height: auto; display: block; margin: 0 auto 15px auto;" onerror="this.style.display='none'" alt="Logo">
                    <div style="font-weight: bold; font-size: 18px; margin-bottom: 4px;">ชุมนุมค่ายอาสาพัฒนาชนบท มหาวิทยาลัยธรรมศาสตร์</div>
                    <div style="font-weight: bold; font-size: 18px; margin-bottom: 4px;">สรุปรายการการเงิน</div>
                    <div style="font-weight: bold; font-size: 18px;">โครงการ: ${data.camp.name}</div>
                </div>
                
                <table class="pdf-table">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 8px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;">รายการ</th>
                            <th class="pdf-th" style="width: 15%;">รายรับ</th>
                            <th class="pdf-th" style="width: 15%;">รายจ่าย</th>
                            <th class="pdf-th" style="width: 18%;"></th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (data.generalIncomes.length > 0) {
            data.generalIncomes.forEach(inc => {
                innerHtmlStr += `<tr style="page-break-inside: avoid;"><td class="pdf-td" style="padding-left: 10px;">${inc.name}</td><td class="pdf-td-num">${formatMoney(inc.amt)}</td><td class="pdf-td-num"></td><td class="pdf-td-num"></td></tr>`;
            });
        }

        for (const [dept, info] of Object.entries(data.departmentsData)) {
            let deptLabel = dept.includes('ฝ่าย') || dept.includes('รายจ่าย') ? dept : `ฝ่าย${dept}`;
            innerHtmlStr += `<tr style="page-break-inside: avoid;"><td colspan="4" style="padding: 10px 0 4px 0; font-weight: bold;">${deptLabel}</td></tr>`;
            
            info.items.forEach(item => {
                innerHtmlStr += `<tr style="page-break-inside: avoid;"><td style="padding: 2px 0 2px 20px;">${item.name}</td><td class="pdf-td-num">${item.inc > 0 ? formatMoney(item.inc) : ''}</td><td class="pdf-td-num">${item.exp > 0 ? formatMoney(item.exp) : ''}</td><td class="pdf-td-num"></td></tr>`;
            });
            
            let deptNet = info.inc - info.exp;
            innerHtmlStr += `<tr style="font-weight: bold; page-break-inside: avoid;"><td style="padding: 6px 0 6px 20px;">รวมค่าใช้จ่าย${deptLabel}</td><td class="pdf-td-num">${formatMoney(info.inc)}</td><td class="pdf-td-num">${formatMoney(info.exp)}</td><td class="pdf-td-num">${formatNet(deptNet)}</td></tr>`;
        }

        innerHtmlStr += `
                    <tr style="font-weight: bold; page-break-inside: avoid;">
                        <td style="padding: 12px 0; border-top: 1px solid #000; border-bottom: 2px solid #000;">รวมสุทธิ</td>
                        <td style="text-align: right; padding: 12px 0; border-top: 1px solid #000; border-bottom: 2px solid #000;">${formatMoney(data.totalIncome)}</td>
                        <td style="text-align: right; padding: 12px 0; border-top: 1px solid #000; border-bottom: 2px solid #000;">${formatMoney(data.totalExpense)}</td>
                        <td style="text-align: right; padding: 12px 0; border-top: 1px solid #000; border-bottom: 2px solid #000;">${formatNet(data.net)}</td>
                    </tr>
                </tbody>
            </table>
        `;

        if (formValues.showExtended) {
            innerHtmlStr += `
                <div style="margin-top: 30px; font-weight: bold; width: 65%; page-break-inside: avoid;">
                    <div style="margin-bottom: 10px;">ณ วันที่ ${dateStr}</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td class="pdf-td">รายรับรับจริง</td><td class="pdf-td-num">${formatMoney(data.totalIncome)}</td><td style="padding-left: 10px; width: 40px;">บาท</td></tr>
                        <tr><td class="pdf-td">รายรับค้างรับ</td><td class="pdf-td-num">${formValues.pendingInc > 0 ? formatMoney(formValues.pendingInc) : '-'}</td><td style="padding-left: 10px;">บาท</td></tr>
                        <tr><td class="pdf-td">รายรับรวม</td><td class="pdf-td-num">${formatMoney(totalIncSum)}</td><td style="padding-left: 10px;">บาท</td></tr>
                        
                        <tr><td style="padding: 10px 0 4px 0;">รายจ่ายจ่ายจริง</td><td style="text-align: right; padding: 10px 0 4px 0;">${formatMoney(totalExpSum)}</td><td style="padding-left: 10px; padding-top: 6px;">บาท</td></tr>
                        <tr><td class="pdf-td">รายจ่ายรวม</td><td class="pdf-td-num">${formatMoney(totalExpSum)}</td><td style="padding-left: 10px;">บาท</td></tr>
                        
                        <tr><td style="padding: 10px 0 4px 0;">เงินค่ายยกยอดมา</td><td style="text-align: right; padding: 10px 0 4px 0;">${formValues.broughtFwd > 0 ? formatMoney(formValues.broughtFwd) : '-'}</td><td style="padding-left: 10px; padding-top: 6px;">บาท</td></tr>
                        <tr><td class="pdf-td">เงินค่ายถูกใช้ทบยอดค่ายนี้ ${data.net > 0 ? '(บวกรายรับสุทธิ)' : '(หักกลบรายจ่าย)'}</td><td class="pdf-td-num">${formatNet(data.net)}</td><td style="padding-left: 10px;">บาท</td></tr>
                        <tr><td class="pdf-td">หนี้ค้างจ่าย</td><td class="pdf-td-num">${formValues.pendingExp > 0 ? formatNet(-formValues.pendingExp) : '-'}</td><td style="padding-left: 10px;">บาท</td></tr>
                        
                        <tr><td class="pdf-td">เงินค่ายคงเหลือ (ตามบัญชี)</td><td class="pdf-td-num">${formatMoney(accountingBalance)}</td><td style="padding-left: 10px;">บาท</td></tr>
                        <tr><td style="padding: 10px 0 4px 0; color: #1d4ed8;">เงินค่ายคงเหลือจริง (สมุดบัญชี)</td><td style="text-align: right; padding: 10px 0 4px 0; color: #1d4ed8;">${formValues.actualBalance > 0 ? formatMoney(formValues.actualBalance) : '-'}</td><td style="padding-left: 10px; padding-top: 6px; color: #1d4ed8;">บาท</td></tr>
                    </table>
                </div>
            `;
        } else {
            innerHtmlStr += `
                <div style="margin-top: 30px; font-weight: bold; width: 55%; page-break-inside: avoid;">
                    <div style="margin-bottom: 10px;">ณ วันที่ ${dateStr}</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td class="pdf-td">รายรับรวม</td><td class="pdf-td-num">${formatMoney(data.totalIncome)}</td><td style="padding-left: 10px; width: 40px;">บาท</td></tr>
                        <tr><td class="pdf-td">รายจ่ายรวม</td><td class="pdf-td-num">${formatMoney(data.totalExpense)}</td><td style="padding-left: 10px;">บาท</td></tr>
                        <tr><td style="padding: 10px 0 4px 0; color: #1d4ed8;">ยอดคงเหลือสุทธิ</td><td style="text-align: right; padding: 10px 0 4px 0; color: #1d4ed8;">${formatNet(data.net)}</td><td style="padding-left: 10px; padding-top: 6px; color: #1d4ed8;">บาท</td></tr>
                    </table>
                </div>
            `;
        }

        innerHtmlStr += `
            <div style="margin-top: 60px; font-size: 12px; color: #555; border-top: 1px dashed #ccc; padding-top: 15px; display: flex; justify-content: space-between; page-break-inside: avoid;">
                <div>
                    <b>พิมพ์เมื่อ:</b> ${dateStr} เวลา ${timeStr} น.<br>
                    <b>ผู้พิมพ์รายงาน:</b> ${cachedProfileName}
                </div>
                <div style="text-align: right;">
                    ออกรายงานโดยระบบ <b>ARSATU NEXT</b>
                </div>
            </div>
        </div>
        `;

        window.rawPdfHtmlContent = innerHtmlStr;

        let previewModal = document.getElementById('pdf-preview-modal');
        if (!previewModal) {
            previewModal = document.createElement('div');
            previewModal.id = 'pdf-preview-modal';
            previewModal.className = 'fixed inset-0 z-[9999] bg-gray-900/80 flex flex-col justify-start items-center overflow-y-auto hidden backdrop-blur-sm';
            document.body.appendChild(previewModal);
        }

        previewModal.innerHTML = `
            <div class="bg-gray-100 rounded-xl shadow-2xl w-full max-w-5xl flex flex-col my-4 sm:my-8 border border-gray-300">
                <div class="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center sticky top-0 z-10 rounded-t-xl">
                    <h3 class="font-bold text-lg text-gray-800 flex items-center gap-2">
                        <i data-lucide="file-text" class="w-5 h-5 text-emerald-600"></i> ตัวอย่างเอกสารก่อนพิมพ์
                    </h3>
                    <div class="flex gap-2">
                        <button onclick="closePdfPreview()" class="px-4 py-2 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">ยกเลิก</button>
                        <button onclick="downloadPdfFromPreview('${data.camp.name}')" class="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2">
                            <i data-lucide="download" class="w-4 h-4"></i> ดาวน์โหลด PDF
                        </button>
                    </div>
                </div>
                
                <div class="p-4 sm:p-8 overflow-x-auto flex justify-center items-start min-h-[50vh] bg-gray-200 rounded-b-xl">
                    <div id="pdf-print-source" class="shadow-lg border border-gray-300 bg-white" style="width: 210mm; min-height: 297mm; padding: 15mm 20mm; box-sizing: border-box;">
                        ${innerHtmlStr}
                    </div>
                </div>
            </div>
        `;

        previewModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; 
        if (typeof lucide !== 'undefined') lucide.createIcons();
        Swal.close();

    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
};

window.closePdfPreview = function() {
    const modal = document.getElementById('pdf-preview-modal');
    if (modal) modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
};

// ================= ฟังก์ชันดาวน์โหลด PDF (Bypass หน้าจอ แก้ขอบขาด 100%) ================= //

window.downloadPdfFromPreview = async function(campName) {
    const sourceElement = document.getElementById('pdf-print-source');
    if (!sourceElement) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบเนื้อหาเอกสารสำหรับสร้าง PDF', 'error');
        return;
    }

    Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    sourceElement.classList.remove('shadow-lg', 'border', 'border-gray-300');
    const originalMinHeight = sourceElement.style.minHeight;
    sourceElement.style.minHeight = 'auto';

    try {
        const opt = {
            margin:       0,
            filename:     `สรุปการเงิน_${campName}.pdf`,
            image:        { type: 'jpeg', quality: 1 },
            html2canvas:  { 
                scale: 2, 
                useCORS: true
            }, 
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        await html2pdf().set(opt).from(sourceElement).save();
        Swal.close();
    } catch (err) {
        Swal.fire('ข้อผิดพลาดในการโหลด PDF', err.message, 'error');
    } finally {
        sourceElement.classList.add('shadow-lg', 'border', 'border-gray-300');
        sourceElement.style.minHeight = originalMinHeight;
    }
};

// ================= ระบบดาวน์โหลดรายงาน Excel ================= //

window.exportExcel = async function() {
    Swal.fire({ title: 'กำลังสร้างไฟล์ Excel...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        const data = await getReportData();
        const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute:'2-digit' });
        
        let excelData = [
            ['ชุมนุมค่ายอาสาพัฒนาชนบท มหาวิทยาลัยธรรมศาสตร์'],
            ['สรุปรายการการเงิน'],
            [`โครงการ: ${data.camp.name}`],
            [`พิมพ์เมื่อ: ${dateStr} เวลา ${timeStr} น. | ผู้พิมพ์: ${cachedProfileName}`],
            [''],
            ['รายการ', 'รายรับ', 'รายจ่าย']
        ];

        if (data.generalIncomes.length > 0) {
            data.generalIncomes.forEach(inc => { excelData.push([inc.name, inc.amt, '']); });
        }

        for (const [dept, info] of Object.entries(data.departmentsData)) {
            let deptLabel = dept.includes('ฝ่าย') || dept.includes('รายจ่าย') ? dept : `ฝ่าย${dept}`;
            excelData.push([deptLabel, '', '']);
            info.items.forEach(item => { excelData.push([`  ${item.name}`, item.inc > 0 ? item.inc : '', item.exp > 0 ? item.exp : '']); });
            excelData.push([`รวมค่าใช้จ่าย${deptLabel}`, info.inc, info.exp]);
        }

        excelData.push(['']);
        excelData.push(['รวมสุทธิ', data.totalIncome, data.totalExpense]);
        excelData.push(['ยอดคงเหลือสุทธิ', data.net, '']);

        const ws = XLSX.utils.aoa_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "สรุปการเงิน");
        XLSX.writeFile(wb, `สรุปการเงิน_${data.camp.name}.xlsx`);
        Swal.close();
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
};