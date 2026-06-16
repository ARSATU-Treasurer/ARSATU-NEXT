// รายชื่อฝ่ายทั้งหมด
const DEPARTMENTS = ["อำนวยการ", "เลขานุการ", "เหรัญญิก", "ทะเบียน", "โครงงาน", "อุปกรณ์", "สถานที่", "สวัสดิการ", "สัมพันธ์ชาวบ้าน", "PR", "สปอนเซอร์", "สันทนาการ"];

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    
    // โหลดค่าย
    const { data: camps } = await supabaseClient.from('camps').select('*').order('created_at', { ascending: false });
    const select = document.getElementById('budget-camp-select');
    select.innerHTML = camps.map(c => `<option value="${c.id}" ${c.is_active ? 'selected':''}>${c.name} ${c.is_active ? '(ปัจจุบัน)':''}</option>`).join('');
    
    loadBudgets();
});

async function loadBudgets() {
    const campId = document.getElementById('budget-camp-select').value;
    const grid = document.getElementById('budgets-grid');
    grid.innerHTML = '<div class="col-span-full text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i> กำลังคำนวณยอดการใช้เงิน...</div>';
    lucide.createIcons();

    try {
        // ดึงเพดานงบที่ตั้งไว้
        const { data: budgets } = await supabaseClient.from('department_budgets').select('*').eq('camp_id', campId);
        
        // ดึงรายการเบิกจ่ายของค่ายนี้ (ไม่นับที่ถูกตีกลับ หรือ ร่าง)
        const { data: clearances } = await supabaseClient.from('clearances')
            .select('department, total_amount, actual_amount, status')
            .eq('camp_id', campId)
            .in('request_type', ['advance', 'reimburse', 'other_expense'])
            .neq('status', 'rejected')
            .neq('status', 'draft');

        // คำนวณยอดใช้ไป
        let usage = {};
        DEPARTMENTS.forEach(d => usage[d] = 0);
        
        if (clearances) {
            clearances.forEach(c => {
                const amt = (c.status === 'cleared' && c.actual_amount !== null) ? parseFloat(c.actual_amount) : parseFloat(c.total_amount);
                if (usage[c.department] !== undefined) usage[c.department] += amt;
            });
        }

        grid.innerHTML = DEPARTMENTS.map(dept => {
            const b = budgets?.find(x => x.department === dept);
            const budgetLimit = b ? parseFloat(b.budget_amount) : 0;
            const used = usage[dept];
            const percent = budgetLimit > 0 ? Math.min((used / budgetLimit) * 100, 100) : (used > 0 ? 100 : 0);
            const isOver = used > budgetLimit && budgetLimit > 0;

            return `
            <div class="bg-white p-5 rounded-2xl border ${isOver ? 'border-red-300 shadow-red-100' : 'border-gray-100'} shadow-sm">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="font-bold text-gray-800">${dept}</h3>
                    <button onclick="editBudget('${campId}', '${dept}', ${budgetLimit})" class="p-1.5 bg-gray-50 text-gray-500 hover:text-indigo-600 rounded-lg"><i data-lucide="edit" class="w-4 h-4"></i></button>
                </div>
                <div class="flex justify-between text-xs mb-1">
                    <span class="text-gray-500">ใช้ไป: ${used.toLocaleString()} ฿</span>
                    <span class="font-bold ${isOver ? 'text-red-500' : 'text-indigo-600'}">งบ: ${budgetLimit.toLocaleString()} ฿</span>
                </div>
                <div class="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div class="${isOver ? 'bg-red-500' : 'bg-indigo-500'} h-2 rounded-full transition-all" style="width: ${percent}%"></div>
                </div>
            </div>`;
        }).join('');
        lucide.createIcons();

    } catch(e) { console.error(e); grid.innerHTML = `<div class="col-span-full text-red-500">${e.message}</div>`; }
}

window.editBudget = async function(campId, dept, currentLimit) {
    const { value: amount } = await Swal.fire({
        title: `ตั้งงบประมาณ`,
        text: `ฝ่าย: ${dept}`,
        input: 'number',
        inputValue: currentLimit || '',
        inputAttributes: { min: 0, step: 0.01 },
        showCancelButton: true,
        confirmButtonText: 'บันทึกเพดานงบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#4f46e5'
    });

    if (amount !== undefined) {
        Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // เช็คว่ามี Record เดิมไหม
        const { data: existing } = await supabaseClient.from('department_budgets').select('id').eq('camp_id', campId).eq('department', dept).single();
        
        if (existing) {
            await supabaseClient.from('department_budgets').update({ budget_amount: amount }).eq('id', existing.id);
        } else {
            await supabaseClient.from('department_budgets').insert([{ camp_id: campId, department: dept, budget_amount: amount }]);
        }
        
        Swal.close();
        loadBudgets();
    }
}