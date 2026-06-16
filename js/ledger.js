// js/ledger.js

let currentLedgerView = 'main'; // ค่าเริ่มต้นเป็นสมุดบัญชีรวมทั้งหมด
let cachedProfileName = 'ไม่ระบุชื่อ';
let currentCampId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 🌟 1. เตรียมข้อมูลพื้นฐาน (Profile, Role, Camp)
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
            cachedProfileName = profile.full_name || 'ไม่ระบุชื่อ';
            // ปลดล็อกเมนูแอดมินถ้ามีสิทธิ์
            if (profile.role === 'admin') {
                const adminLink = document.getElementById('admin-action-link');
                if (adminLink) adminLink.classList.remove('hidden');
            }
        }
    }

    const { data: camp } = await supabaseClient.from('camps').select('*').eq('is_active', true).single();
    if (camp) {
        currentCampId = camp.id;
        const badge = document.getElementById('active-camp-badge');
        if (badge) badge.innerText = `โครงการปัจจุบัน: ${camp.name}`;
    }

    // 🌟 2. สั่งโหลดข้อมูลตารางและบัญชี
    fetchGlobalBanks();
    fetchLedgerTransactions();
});

// ================= ระบบแท็บและการแสดงผล (UI State) ================= //

window.switchLedgerTab = function(tabType) {
    currentLedgerView = tabType;
    
    const btnMain = document.getElementById('tab-main');
    const btnProject = document.getElementById('tab-project');
    const exportDiv = document.getElementById('project-export-actions');
    
    if(tabType === 'main') {
        btnMain.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold bg-white text-emerald-600 shadow-sm transition-all";
        btnProject.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        if(exportDiv) exportDiv.classList.add('hidden'); // ซ่อนปุ่ม Export
    } else {
        btnProject.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold bg-white text-blue-600 shadow-sm transition-all";
        btnMain.className = "flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-sm font-bold text-gray-500 hover:text-gray-700 transition-all";
        if(exportDiv) exportDiv.classList.remove('hidden'); // โชว์ปุ่ม Export
    }
    
    fetchLedgerTransactions(); // รีโหลดตารางใหม่ตามแท็บ
};

function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

// ================= โหลดข้อมูลสมุดบัญชี (Core Ledger) ================= //

// 1. โหลดข้อมูลยอดเงินรวม (บัญชีส่วนกลาง)
async function fetchGlobalBanks() {
    const container = document.getElementById('global-banks-container');
    try {
        const { data: banks, error } = await supabaseClient.from('bank_accounts').select('*');
        if (error) throw error;

        if (!banks || banks.length === 0) {
            container.innerHTML = '<div class="text-center py-5 text-gray-400 bg-white rounded-2xl border border-gray-100 col-span-full">ยังไม่มีข้อมูลบัญชี</div>';
            return;
        }

        container.innerHTML = banks.map(b => {
            const hexColor = b.color || '#3B82F6'; 
            return `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div class="w-12 h-12 rounded-full border flex items-center justify-center shrink-0" 
                     style="background-color: ${hexColor}15; border-color: ${hexColor}30; color: ${hexColor};">
                    <i data-lucide="building" class="w-6 h-6"></i>
                </div>
                <div>
                    <p class="text-[10px] text-gray-500 font-bold uppercase">${b.name}</p>
                    <p class="font-extrabold text-lg" style="color: ${hexColor};">
                        ${parseFloat(b.balance).toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿
                    </p>
                </div>
            </div>`;
        }).join('');
        lucide.createIcons();
    } catch (err) { console.error("Bank Error:", err); }
}

// 2. โหลดรายการเคลื่อนไหวจากตาราง Transactions
async function fetchLedgerTransactions() {
    const container = document.getElementById('ledger-container');
    container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2"></i> กำลังโหลดรายการ...</td></tr>`;
    lucide.createIcons();

    try {
        let query = supabaseClient
            .from('transactions')
            .select(`*, clearances (purpose, department)`)
            .order('created_at', { ascending: false });

        // 🌟 ถ้าอยู่แท็บ Project ให้กรองเฉพาะค่ายปัจจุบัน
        if (currentLedgerView === 'project' && currentCampId) {
            query = query.eq('camp_id', currentCampId);
        }

        const { data: trans, error } = await query;
        if (error) throw error;

        if (!trans || trans.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400 text-xs">ยังไม่มีรายการบันทึกในสมุดบัญชีนี้</td></tr>`;
            return;
        }

        container.innerHTML = trans.map(t => {
            const isIncome = t.transaction_type === 'income'; 
            const dept = t.clearances?.department || '-';
            const purpose = t.clearances?.purpose || t.description || 'รายการเบิกจ่าย';
            
            let typeLabel = "";
            if (t.description.includes('อนุมัติเบิกจ่าย')) typeLabel = "อนุมัติเบิก";
            else if (t.description.includes('รับเงินทอนคืน')) typeLabel = "รับคืนส่วนต่าง";
            else if (t.description.includes('โอนชดเชย')) typeLabel = "โอนคืนส่วนต่าง";
            else typeLabel = isIncome ? "เงินเข้า" : "เบิกจ่าย";

            const targetId = t.clearance_id ? `'${t.clearance_id}'` : null;
            const billIdHtml = t.clearance_id ? `<div class="text-[10px] font-normal text-gray-400 mt-1 font-mono tracking-tight">รหัสบิล: ${t.clearance_id}</div>` : '';

            return `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-50">
                <td class="p-4 text-xs text-gray-500 align-top">${new Date(t.created_at).toLocaleDateString('th-TH')}</td>
                <td class="p-4 align-top">
                    <div class="text-xs font-bold text-gray-800 whitespace-normal min-w-[200px]">[${typeLabel}] ${purpose}</div>
                    ${billIdHtml}
                </td>
                <td class="p-4 text-xs text-gray-600 align-top">${dept}</td>
                <td class="p-4 text-right font-bold text-green-600 text-xs align-top">${isIncome ? '+' + parseFloat(t.amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
                <td class="p-4 text-right font-bold text-red-600 text-xs align-top">${!isIncome ? '-' + parseFloat(t.amount).toLocaleString('th-TH', {minimumFractionDigits: 2}) : '-'}</td>
                <td class="p-4 text-center align-top">
                    ${targetId ? `
                    <button onclick="viewLedgerDetails(${targetId})" class="text-blue-500 hover:bg-blue-50 p-1.5 rounded-lg">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>` : `<span class="text-gray-300 text-[10px]">ไม่มีข้อมูล</span>`}
                </td>
            </tr>`;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        console.error("Ledger Error:", err);
        container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500 text-xs">Error: ${err.message}</td></tr>`;
    }
}

// ================= ระบบจัดการ Modal ดูหลักฐาน ================= //

window.viewLedgerDetails = async function(clearanceId) {
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    content.innerHTML = '<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto"></i></div>';
    lucide.createIcons();

    try {
        const { data: clearance, error: clErr } = await supabaseClient.from('clearances').select('*, profiles!user_id(full_name), camps(name)').eq('id', clearanceId).single();
        const { data: items } = await supabaseClient.from('clearance_items').select('*').eq('clearance_id', clearanceId);

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

        const itemsHTML = (items || []).map((item, i) => `
            <div class="flex justify-between items-center py-1.5 border-b border-gray-50 text-xs">
                <span>${i + 1}. ${item.description} (x${item.quantity})</span>
                <span class="font-bold">${parseFloat(item.amount).toLocaleString('th-TH')} ฿</span>
            </div>
        `).join('');

        content.innerHTML = `
            <div class="space-y-2 border-b pb-4">
                <p class="text-xs text-gray-500">โครงการ: <b class="text-gray-800">${clearance.camps.name}</b></p>
                <p class="text-xs text-gray-500">หัวข้อ: <b class="text-gray-800">${clearance.purpose}</b></p>
                <p class="text-xs text-gray-500">ผู้ขอเบิก: <b class="text-gray-800">${clearance.unregistered_name || clearance.profiles?.full_name || 'ไม่ระบุชื่อ'}</b></p>
            </div>
            <div class="mt-4">
                <p class="text-xs font-bold text-gray-700 mb-2 bg-gray-100 p-2 rounded">รายการที่เบิก</p>
                ${itemsHTML}
                <div class="mt-4 text-right">
                    <p class="text-xs text-gray-500">ยอดที่ทำการอนุมัติ</p>
                    <p class="text-xl font-extrabold text-blue-600">${parseFloat(clearance.total_amount).toLocaleString('th-TH')} ฿</p>
                </div>
            </div>
            <div class="pt-2 mt-4 border-t border-gray-100">
                <p class="text-xs font-bold text-gray-700 mb-2 mt-2">หลักฐานใบเสร็จ / สลิป</p>
                ${evidenceHTML || '<p class="text-xs text-gray-400">ไม่พบหลักฐาน</p>'}
            </div>
        `;
        lucide.createIcons();
    } catch (err) {
        content.innerHTML = `<p class="text-red-500 text-center text-xs">ไม่พบข้อมูล: ${err.message}</p>`;
    }
};

window.closeModal = function() {
    document.getElementById('details-modal').classList.add('hidden');
};

// ================= ระบบดาวน์โหลดรายงานบัญชีโครงการ (Exports) ================= //

function formatMoney(amount) {
    if (!amount && amount !== 0) return '';
    const num = parseFloat(amount);
    if (num === 0) return '-';
    return Math.abs(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getReportData() {
    const { data: camp } = await supabaseClient.from('camps').select('*').eq('is_active', true).single();
    if (!camp) throw new Error("ไม่พบโครงการที่กำลังดำเนินการ");

    // รายงานสรุปดึงข้อมูลจาก clearances เพื่อสรุปตามฝ่าย (อิงจาก Business Logic ของค่าย)
    const { data: clearances, error } = await supabaseClient
        .from('clearances')
        .select('purpose, department, request_type, actual_amount, total_amount')
        .eq('camp_id', camp.id)
        .eq('status', 'cleared');

    if (error) throw error;

    let totalIncome = 0;
    let totalExpense = 0;
    let reportRows = []; 
    
    // 🌟 เพิ่มชื่อผู้สั่งพิมพ์ลงไปในหัวตาราง Excel
    let excelData = [
        ['ชุมนุมค่ายอาสาพัฒนาชนบท มหาวิทยาลัยธรรมศาสตร์'],
        ['สรุปรายการการเงิน'],
        [`โครงการ${camp.name}`],
        [`พิมพ์โดย: ${cachedProfileName} | วันที่พิมพ์: ${new Date().toLocaleDateString('th-TH')}`],
        [''],
        ['รายการ', 'รายรับ', 'รายจ่าย']
    ]; 

    const safeClearances = clearances || [];

    const incomes = safeClearances.filter(c => c.request_type === 'income' || c.request_type === 'other_income');
    if (incomes.length > 0) {
        reportRows.push({ type: 'header', text: 'รายรับ' });
        excelData.push(['รายรับ', '', '']);
        incomes.forEach(inc => {
            const amt = parseFloat(inc.actual_amount || inc.total_amount || 0);
            totalIncome += amt;
            reportRows.push({ type: 'item', purpose: inc.purpose, inc: amt, exp: 0 });
            excelData.push([`  ${inc.purpose}`, amt, '']);
        });
    }

    const expenses = safeClearances.filter(c => c.request_type !== 'income' && c.request_type !== 'other_income');
    const departments = [...new Set(expenses.map(e => e.department))];

    departments.forEach(dept => {
        const deptName = dept === 'ทั่วไป' ? 'รายจ่ายทั่วไป' : `ฝ่าย${dept}`;
        reportRows.push({ type: 'header', text: deptName });
        excelData.push([deptName, '', '']);
        
        let deptTotal = 0;
        const deptExps = expenses.filter(e => e.department === dept);
        deptExps.forEach(exp => {
            const amt = parseFloat(exp.actual_amount || exp.total_amount || 0);
            deptTotal += amt;
            totalExpense += amt;
            reportRows.push({ type: 'item', purpose: exp.purpose, inc: 0, exp: amt });
            excelData.push([`  - ${exp.purpose}`, '', amt]);
        });
        
        reportRows.push({ type: 'sum', text: `รวมค่าใช้จ่าย${deptName}`, amount: deptTotal });
        excelData.push([`รวมค่าใช้จ่าย${deptName}`, '', deptTotal]);
    });

    const net = totalIncome - totalExpense;
    excelData.push(['']);
    excelData.push(['รายรับรวม', totalIncome, '']);
    excelData.push(['รายจ่ายรวม', '', totalExpense]);
    excelData.push(['เงินค่ายคงเหลือสุทธิ', net, '']);

    return { reportRows, excelData, campName: camp.name, totalIncome, totalExpense, net };
}

window.exportPDF = async function() {
    Swal.fire({ title: 'กำลังจัดหน้ากระดาษ PDF...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        const data = await getReportData();
        
        document.getElementById('pdf-camp-name').innerText = `โครงการ${data.campName}`;
        document.getElementById('pdf-total-income').innerText = formatMoney(data.totalIncome);
        document.getElementById('pdf-total-expense').innerText = formatMoney(data.totalExpense);
        document.getElementById('pdf-net-balance').innerText = formatMoney(data.net);
        
        // 🌟 ใส่ชื่อผู้พิมพ์รายงาน
        if(document.getElementById('pdf-printed-by')) document.getElementById('pdf-printed-by').innerText = cachedProfileName;

        const printDate = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute:'2-digit' });
        if(document.getElementById('pdf-print-date')) document.getElementById('pdf-print-date').innerText = printDate;
        
        const tbody = document.getElementById('pdf-table-body');
        tbody.innerHTML = data.reportRows.map(row => {
            if (row.type === 'header') {
                return `<tr><td colspan="3" class="pt-5 pb-1 font-extrabold text-gray-900 text-[15px]">${row.text}</td></tr>`;
            } else if (row.type === 'sum') {
                return `<tr><td class="py-2 font-bold text-gray-800 text-sm">${row.text}</td><td class="py-2"></td><td class="py-2 text-right font-bold border-t border-gray-400">${formatMoney(row.amount)}</td></tr>`;
            } else {
                return `<tr><td class="py-1.5 pl-4 text-gray-700 text-sm">- ${row.purpose}</td><td class="py-1.5 text-right text-sm">${row.inc > 0 ? formatMoney(row.inc) : ''}</td><td class="py-1.5 text-right text-sm">${row.exp > 0 ? formatMoney(row.exp) : ''}</td></tr>`;
            }
        }).join('');

        const element = document.getElementById('pdf-content');
        const container = document.getElementById('pdf-export-container');
        
        const opt = {
            margin:       [10, 0, 10, 0], 
            filename:     `สรุปการเงิน_ค่าย_${data.campName}.pdf`,
            image:        { type: 'jpeg', quality: 1 },
            html2canvas:  { scale: 2, useCORS: true }, 
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        container.style.visibility = 'visible';
        await html2pdf().set(opt).from(element).save();
        container.style.visibility = 'hidden';

        Swal.close();
    } catch (err) {
        document.getElementById('pdf-export-container').style.visibility = 'hidden';
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
};

window.exportExcel = async function() {
    Swal.fire({ title: 'กำลังสร้างไฟล์ Excel...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        const data = await getReportData();
        const ws = XLSX.utils.aoa_to_sheet(data.excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "สรุปการเงิน");
        XLSX.writeFile(wb, `สรุปการเงิน_ค่าย_${data.campName}.xlsx`);
        Swal.close();
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
};