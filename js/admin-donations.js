// js/admin-donations.js
let currentCampId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';

    // ดึงค่ายปัจจุบันที่ดำเนินการอยู่
    const { data: camp } = await supabaseClient.from('camps').select('id').eq('is_active', true).single();
    if (camp) {
        currentCampId = camp.id;
        loadAdminDonationDashboard();
    }
});

async function loadAdminDonationDashboard() {
    try {
        // 1. ดึงเป้าหมายระดมทุนประจำโครงการ
        const { data: goalData } = await supabaseClient.from('donation_goals').select('goal_amount').eq('camp_id', currentCampId).single();
        document.getElementById('goal-display').innerText = (goalData ? parseFloat(goalData.goal_amount) : 0).toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' ฿';

        // 2. เรียกฟังก์ชันดึงตารางประวัติกระแสเงินบริจาค (ล้างปัญหาโหลดค้าง)
        await fetchTransactionHistory();
    } catch(err) { console.error(err); }
}

async function fetchTransactionHistory() {
    try {
        const { data: trans } = await supabaseClient
            .from('clearances')
            .select('*, profiles!user_id(full_name)')
            .eq('camp_id', currentCampId)
            .eq('request_type', 'income') 
            .eq('status', 'cleared')
            .order('created_at', { ascending: false });

        const tableBody = document.getElementById('transaction-history-body');
        const cashTotal = document.getElementById('cash-total');
        const transferTotal = document.getElementById('transfer-total');

        if (!trans || trans.length === 0) {
            // 🌟 แก้ colspan เป็น 5
            tableBody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400 text-xs">ไม่มีประวัติการรับเงิน</td></tr>';
            cashTotal.innerText = '0.00 ฿';
            transferTotal.innerText = '0.00 ฿';
            return;
        }

        let cash = 0, transfer = 0;
        tableBody.innerHTML = trans.map(t => {
            const isCash = t.purpose.includes('เงินสด');
            const amt = parseFloat(t.total_amount);
            if (isCash) cash += amt; else transfer += amt;
            
            // 🌟 สร้างปุ่มลบ (Void)
            const safePurpose = (t.purpose || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const actionBtn = `<button onclick="voidDonation('${t.id}', '${safePurpose}', ${amt})" class="text-gray-400 hover:text-red-600 p-1.5 rounded-lg transition-colors bg-gray-50 hover:bg-red-50" title="ยกเลิกรายการนี้"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;

            return `
                <tr class="border-b border-gray-100 text-xs hover:bg-gray-50/80 transition-colors">
                    <td class="p-4 text-gray-500">${new Date(t.created_at).toLocaleDateString('th-TH')}</td>
                    <td class="p-4 font-bold text-gray-800">${t.purpose} <span class="font-normal text-gray-400">(โดย: ${t.profiles?.full_name || 'ไม่ระบุ'})</span></td>
                    <td class="p-4"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isCash ? 'bg-orange-100 text-orange-700':'bg-blue-100 text-blue-700'}">${isCash ? 'เงินสด' : 'เงินโอน'}</span></td>
                    <td class="p-4 text-right font-bold text-gray-900">${amt.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</td>
                    <td class="p-4 text-center flex justify-center items-center h-full">
                        ${actionBtn}
                    </td>
                </tr>`;
        }).join('');

        cashTotal.innerText = cash.toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' ฿';
        transferTotal.innerText = transfer.toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' ฿';
        lucide.createIcons();

    } catch(err) { console.error("Fetch History Error:", err); }
}

// ================= ระบบ Audit Log & Void Donation ================= //
window.voidDonation = async function(clearanceId, purpose, amount) {
    const confirmResult = await Swal.fire({
        title: 'ยกเลิกยอดบริจาค (Void)?',
        text: `ระบบจะยกเลิกรายการ "${purpose}" และบันทึกประวัติลง Audit Log ยืนยันหรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ยืนยันการยกเลิก',
        cancelButtonText: 'ปิด',
        reverseButtons: true
    });

    if (confirmResult.isConfirmed) {
        Swal.fire({ title: 'กำลังดำเนินการ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            
            // 1. บันทึกลง Audit Log ก่อน
            const auditPayload = {
                user_id: session.user.id,
                action: 'VOID_DONATION',
                details: `ยกเลิกยอดบริจาค: ${purpose} | ยอดเงิน: ${amount.toLocaleString()}`,
                created_at: new Date().toISOString()
            };
            const { error: auditErr } = await supabaseClient.from('audit_logs').insert([auditPayload]);
            if (auditErr) throw new Error('บันทึก Audit Log ล้มเหลว: ' + auditErr.message);

            // 2. ดึงสถานะกลับเป็น rejected เพื่อหักยอดออกจากระบบ
            const { error: updateErr } = await supabaseClient
                .from('clearances')
                .update({ 
                    status: 'rejected',
                    reject_reason: 'แอดมินยกเลิกรายการรับเงิน (Void)' 
                })
                .eq('id', clearanceId);
            if (updateErr) throw updateErr;

            // 3. ลบ Transaction ที่ผูกกับบิลนี้ (เพื่อให้ยอดเงินเด้งกลับ)
            await supabaseClient.from('transactions').delete().eq('clearance_id', clearanceId);

            await Swal.fire('สำเร็จ!', 'ทำรายการ Void และบันทึกประวัติเรียบร้อยแล้ว', 'success');
            
            // รีโหลดหน้าแดชบอร์ดใหม่เพื่ออัปเดตตัวเลขทั้งหมด
            loadAdminDonationDashboard();

        } catch (err) {
            Swal.fire('ข้อผิดพลาด', err.message, 'error');
        }
    }
}

function openGoalModal() { document.getElementById('goal-modal').classList.remove('hidden'); }
function closeGoalModal() { document.getElementById('goal-modal').classList.add('hidden'); }

async function saveGoal() {
    const goal = parseFloat(document.getElementById('new-goal').value) || 0;
    try {
        await supabaseClient.from('donation_goals').upsert({ camp_id: currentCampId, goal_amount: goal }, { onConflict: 'camp_id' });
        Swal.fire('สำเร็จ', 'บันทึกเป้าหมายเรียบร้อยแล้ว', 'success');
        closeGoalModal(); loadAdminDonationDashboard();
    } catch(err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
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