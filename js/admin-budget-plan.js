// js/admin-budget-plan.js

let currentCampId = null;
let allRequests = [];
let filteredRequests = [];
let departmentBudgets = {}; // เก็บข้อมูลโควตางบแต่ละฝ่าย
let currentModalContext = { deptUsedBudget: 0, deptAllocatedBudget: 0 }; // เก็บค่าไว้คำนวณหลอดพลัง

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session }, error: authError } = await supabaseClient.auth.getSession();
    if (authError || !session) return window.location.href = '../index.html';

    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (!profile || profile.role !== 'admin') return window.location.href = '../member/dashboard.html';

    const { data: camp } = await supabaseClient.from('camps').select('id').eq('is_active', true).single();
    if (camp) currentCampId = camp.id;

    document.getElementById('admin-edit-form').addEventListener('submit', handleAdminSave);

    await fetchAdminBudgets();
});

window.fetchAdminBudgets = async function() {
    const container = document.getElementById('admin-request-list');
    container.innerHTML = '<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2"></i>กำลังโหลดข้อมูล...</div>';
    lucide.createIcons();

    try {
        // 🌟 ดึงข้อมูลโควตางบประมาณจากตาราง department_ceilings
        const { data: budgetData } = await supabaseClient
            .from('department_ceilings')
            .select('*')
            .eq('camp_id', currentCampId);
            
        if (budgetData) {
            // เปลี่ยนมาใช้คอลัมน์ ceiling_amount ตามโครงสร้างใหม่
            budgetData.forEach(b => departmentBudgets[b.department] = parseFloat(b.ceiling_amount) || 0);
        }

        const { data, error } = await supabaseClient
            .from('budget_requests')
            .select(`*, owner:profiles!owner_id(full_name), budget_items(*)`)
            .eq('camp_id', currentCampId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        allRequests = data || [];
        
        populateDeptFilter();
        applyAdminFilters();
    } catch (err) {
        container.innerHTML = `<p class="text-red-500 text-center py-10">เกิดข้อผิดพลาด: ${err.message}</p>`;
    }
};

function populateDeptFilter() {
    const deptSelect = document.getElementById('filter-dept');
    const currentVal = deptSelect.value;
    const depts = [...new Set(allRequests.map(r => r.department))].filter(Boolean);
    
    let optionsHTML = '<option value="all">ทุกฝ่าย</option>';
    depts.forEach(d => { optionsHTML += `<option value="${d}">${d}</option>`; });
    
    deptSelect.innerHTML = optionsHTML;
    deptSelect.value = depts.includes(currentVal) ? currentVal : 'all';
}

window.applyAdminFilters = function() {
    const dept = document.getElementById('filter-dept').value;
    const status = document.getElementById('filter-status').value;

    filteredRequests = allRequests.filter(req => {
        let matchDept = dept === 'all' || req.department === dept;
        let matchStatus = status === 'all' ? req.status !== 'draft' : req.status === status;
        return matchDept && matchStatus;
    });

    updateSummary();
    renderRequests();
};

function updateSummary() {
    const submitted = allRequests.filter(r => r.status !== 'draft');
    let sumAll = 0, sumApproved = 0, sumDenied = 0;

    submitted.forEach(req => {
        if (req.budget_items) {
            req.budget_items.forEach(item => {
                const price = parseFloat(item.total_price) || 0;
                sumAll += price;
                if (item.item_status === 'approved') sumApproved += price;
                if (item.item_status === 'denied') sumDenied += price;
            });
        }
    });

    document.getElementById('sum-all').innerText = sumAll.toLocaleString('th-TH') + ' ฿';
    document.getElementById('sum-approved').innerText = sumApproved.toLocaleString('th-TH') + ' ฿';
    document.getElementById('sum-denied').innerText = sumDenied.toLocaleString('th-TH') + ' ฿';
    document.getElementById('sum-pending').innerText = (sumAll - sumApproved - sumDenied).toLocaleString('th-TH') + ' ฿';
}

function renderRequests() {
    const container = document.getElementById('admin-request-list');
    container.innerHTML = '';

    if (filteredRequests.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-400">ไม่พบแฟ้มงบประมาณที่ตรงกับเงื่อนไข</div>';
        return;
    }

    filteredRequests.forEach(req => {
        let itemsHTML = '';
        let folderPendingTotal = 0; // ยอดรวมของที่กำลังรอตรวจในแฟ้มนี้
        let deptUsedTotal = 0; // ยอดรวมที่ฝ่ายนี้ใช้ไปแล้ว (จากแฟ้มอื่นๆ)

        // 1. คำนวณยอดที่ฝ่ายนี้ใช้ไปแล้วทั้งหมด (เอาเฉพาะที่อนุมัติแล้ว)
        allRequests.filter(r => r.department === req.department).forEach(r => {
            if (r.budget_items) {
                r.budget_items.forEach(i => {
                    if (i.item_status === 'approved') {
                        deptUsedTotal += parseFloat(i.total_price) || 0;
                    }
                });
            }
        });

        // 2. คำนวณยอดและวาด HTML ของรายการย่อยในแฟ้มนี้
        if (req.budget_items && req.budget_items.length > 0) {
            const sortedItems = req.budget_items.sort((a, b) => b.priority_level - a.priority_level);
            
            itemsHTML = sortedItems.map(item => {
                const isDenied = item.item_status === 'denied';
                const discountText = item.discount > 0 ? `<span class="text-red-500 ml-1 bg-red-50 px-1 rounded">-ลด ${parseFloat(item.discount).toLocaleString()} ฿</span>` : '';
                
                // บวกยอดรอตรวจเพื่อเอาไปทำหลอดพลังของแฟ้ม
                if (item.item_status === 'pending') {
                    folderPendingTotal += parseFloat(item.total_price) || 0;
                }
                
                let actionBtns = '';
                if (item.item_status === 'pending') {
                    actionBtns = `
                        <button onclick="updateItemStatus('${item.id}', 'approved')" class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1.5 rounded-lg text-[11px] font-bold hover:bg-emerald-100 transition shadow-sm">✅ ให้ผ่าน</button>
                        <button onclick="updateItemStatus('${item.id}', 'denied')" class="bg-red-50 text-red-700 border border-red-200 px-2 py-1.5 rounded-lg text-[11px] font-bold hover:bg-red-100 transition shadow-sm">❌ ตัดทิ้ง</button>
                    `;
                } else {
                    const statusColor = item.item_status === 'approved' ? 'text-emerald-600' : 'text-red-600';
                    const statusText = item.item_status === 'approved' ? '✅ อนุมัติแล้ว' : '❌ ตัดทิ้งแล้ว';
                    actionBtns = `
                        <span class="text-xs font-bold ${statusColor}">${statusText}</span>
                        <button onclick="updateItemStatus('${item.id}', 'pending')" class="text-[10px] text-gray-400 underline ml-2 hover:text-gray-600">เลิกทำ</button>
                    `;
                }

                return `
                <div class="flex justify-between items-center py-3 border-b border-gray-100 last:border-0 ${isDenied ? 'opacity-50 bg-gray-50' : ''}">
                    <div class="flex-1 pr-2">
                        <p class="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                            <span class="text-[10px] bg-pink-50 text-pink-600 border border-pink-100 px-1.5 py-0.5 rounded flex items-center gap-0.5"><i data-lucide="heart" class="w-2.5 h-2.5 fill-current"></i> ${item.priority_level}</span>
                            ${isDenied ? `<s>${item.item_name}</s>` : item.item_name}
                        </p>
                        <p class="text-xs text-gray-500 mt-1">${item.quantity} x ${parseFloat(item.unit_price).toLocaleString()} ฿ ${discountText}</p>
                        ${item.remark ? `<p class="text-[11px] text-gray-600 mt-1.5 bg-yellow-50/50 p-2 rounded-lg border border-yellow-100"><b>หมายเหตุ:</b> ${item.remark.replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div class="text-right shrink-0">
                        <p class="text-sm font-extrabold text-gray-800 mb-2">${parseFloat(item.total_price).toLocaleString()} ฿</p>
                        <div class="flex flex-col gap-1.5 items-end">
                            <div class="flex gap-1.5">${actionBtns}</div>
                            <button onclick="openAdminEdit('${item.id}')" class="text-[10px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-100 transition shadow-sm mt-1">✏️ พิจารณา</button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } else {
            itemsHTML = '<p class="text-sm text-gray-400 text-center py-2">ไม่มีรายการสิ่งของในแฟ้มนี้</p>';
        }

        // 3. สร้างหลอดพลังจำลองงบระดับแฟ้ม (โชว์เฉพาะตอนแฟ้มยังรอตรวจ)
        let folderProgressHtml = '';
        const deptCeiling = departmentBudgets[req.department] || 0;
        
        // 🌟 เอาเงื่อนไข deptCeiling > 0 ออก เพื่อให้มันเข้ามาเช็คด้านใน
        if (req.status === 'pending') {
            if (deptCeiling === 0) {
                // กรณีที่แอดมินยังไม่ได้ตั้งงบใน Database
                folderProgressHtml = `
                    <div class="bg-orange-50 p-3 rounded-xl border border-orange-200 mb-4 shadow-sm text-center">
                        <span class="text-xs font-bold text-orange-700"><i data-lucide="alert-circle" class="w-4 h-4 inline mb-0.5"></i> ยังไม่ได้ตั้งเพดานงบประมาณสำหรับฝ่าย ${req.department}</span>
                        <p class="text-[10px] text-orange-600 mt-1">กรุณาตั้งงบในตารางเมนูจัดการงบประมาณ</p>
                    </div>
                `;
            } else {
                // กรณีที่มีงบปกติ ค่อยวาดหลอดพลัง
                let usedPct = (deptUsedTotal / deptCeiling) * 100;
                let pendingPct = (folderPendingTotal / deptCeiling) * 100;
                let remaining = deptCeiling - deptUsedTotal - folderPendingTotal;

                if (usedPct > 100) usedPct = 100;
                if (usedPct + pendingPct > 100) pendingPct = 100 - usedPct;

                const isOver = (deptUsedTotal + folderPendingTotal) > deptCeiling;
                const barColor = isOver ? 'bg-red-500' : 'bg-indigo-500';
                const remainColor = isOver ? 'text-red-600' : 'text-emerald-600';
                const remainText = isOver ? `ทะลุงบ: ${Math.abs(remaining).toLocaleString()} ฿!` : `เหลือโควตา: ${remaining.toLocaleString()} ฿`;

                folderProgressHtml = `
                    <div class="bg-indigo-50/40 p-3 rounded-xl border border-indigo-100 mb-4 shadow-sm">
                        <div class="flex justify-between items-end mb-2">
                            <span class="text-[10px] font-extrabold text-indigo-900 flex items-center gap-1"><i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i> จำลองผลกระทบต่องบ ${req.department}</span>
                            <span class="text-[10px] font-bold text-gray-600 bg-white px-2 py-0.5 rounded border border-gray-200">เพดาน: ${deptCeiling.toLocaleString()} ฿</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-3 flex overflow-hidden shadow-inner">
                            <div class="bg-gray-400 h-3" style="width: ${usedPct}%"></div>
                            <div class="${barColor} h-3 relative" style="width: ${pendingPct}%">
                                <div class="absolute right-0 top-0 bottom-0 w-1 bg-white/50 animate-pulse"></div>
                            </div>
                        </div>
                        <div class="flex justify-between mt-2">
                            <span class="text-[9px] font-bold text-gray-500">ใช้ไปแล้ว: ${deptUsedTotal.toLocaleString()} ฿</span>
                            <span class="text-[9px] font-extrabold text-indigo-600">แฟ้มนี้: +${folderPendingTotal.toLocaleString()} ฿</span>
                            <span class="text-[9px] font-bold ${remainColor}">${remainText}</span>
                        </div>
                    </div>
                `;
            }
        }

        const reqStatusHtml = req.status === 'pending' 
            ? '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-200">รอส่วนกลางตรวจ</span>' 
            : '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold border border-emerald-200">ตรวจแล้ว</span>';

        const collabBadge = req.co_worker_ids && req.co_worker_ids.length > 0 
            ? `<span class="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-indigo-100"><i data-lucide="users" class="w-3 h-3"></i> +${req.co_worker_ids.length}</span>` 
            : '';

        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-5";
        card.innerHTML = `
            <div class="bg-gray-50 p-4 border-b border-gray-200">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-2 mb-1.5">
                            ${reqStatusHtml}
                            <span class="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 rounded font-bold">${req.department}</span>
                            ${collabBadge}
                        </div>
                        <h3 class="font-bold text-gray-900 text-lg leading-tight">${req.topic_name}</h3>
                        <p class="text-[11px] text-gray-500 mt-1">ผู้เสนอแฟ้ม: ${req.owner?.full_name}</p>
                    </div>
                </div>
            </div>
            <div class="p-4">
                ${folderProgressHtml} ${itemsHTML}
            </div>
            ${req.status === 'pending' ? `
            <div class="p-3 bg-gray-50 border-t border-gray-100">
                <button onclick="markRequestReviewed('${req.id}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-bold shadow-sm transition">กดที่นี่เมื่อตรวจแฟ้มนี้เสร็จเรียบร้อยแล้ว</button>
            </div>
            ` : ''}
        `;
        container.appendChild(card);
    });
    lucide.createIcons();
}

window.updateItemStatus = async (itemId, status) => {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    await supabaseClient.from('budget_items').update({ item_status: status }).eq('id', itemId);
    await fetchAdminBudgets();
    Swal.close();
};

window.markRequestReviewed = async (reqId) => {
    await supabaseClient.from('budget_requests').update({ status: 'reviewed' }).eq('id', reqId);
    fetchAdminBudgets();
    Swal.fire({ title: 'ตรวจแฟ้มเรียบร้อย', icon: 'success', timer: 1500, showConfirmButton: false });
};

// ==========================================
// ✏️ ระบบจำลอง What-If ใน Modal (Progress Bar)
// ==========================================
window.adminCalcTotal = function() {
    const qty = parseFloat(document.getElementById('admin-qty').value) || 0;
    const price = parseFloat(document.getElementById('admin-price').value) || 0;
    const discount = parseFloat(document.getElementById('admin-discount').value) || 0;
    
    let total = (qty * price) - discount;
    if (total < 0) total = 0;
    
    document.getElementById('admin-total-price').value = total;
    document.getElementById('admin-total-display').innerText = total.toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' ฿';

    const alloc = currentModalContext.deptAllocatedBudget;
    const used = currentModalContext.deptUsedBudget;
    
    if (alloc > 0) {
        let usedPct = (used / alloc) * 100;
        let currentPct = (total / alloc) * 100;
        let remaining = alloc - used - total;

        if (usedPct > 100) usedPct = 100;
        if (usedPct + currentPct > 100) currentPct = 100 - usedPct;

        document.getElementById('pb-used').style.width = `${usedPct}%`;
        document.getElementById('pb-current').style.width = `${currentPct}%`;
        
        if (used + total > alloc) {
            document.getElementById('pb-current').classList.replace('bg-indigo-500', 'bg-red-500');
            document.getElementById('pb-text-remain').classList.replace('text-emerald-600', 'text-red-600');
            document.getElementById('pb-text-remain').innerText = `ทะลุงบ: ${(used + total - alloc).toLocaleString()} ฿!`;
        } else {
            document.getElementById('pb-current').classList.replace('bg-red-500', 'bg-indigo-500');
            document.getElementById('pb-text-remain').classList.replace('text-red-600', 'text-emerald-600');
            document.getElementById('pb-text-remain').innerText = `เหลือโควตา: ${remaining.toLocaleString()} ฿`;
        }
        
        document.getElementById('pb-text-current').innerText = `+ เพิ่มชิ้นนี้: ${total.toLocaleString()} ฿`;
    }
}

window.openAdminEdit = (itemId) => {
    let selectedItem = null;
    let selectedReq = null;

    allRequests.forEach(req => { 
        if (req.budget_items) { 
            const item = req.budget_items.find(i => i.id === itemId); 
            if (item) { selectedItem = item; selectedReq = req; }
        }
    });
    if (!selectedItem || !selectedReq) return;

    let totalUsedByDept = 0;
    allRequests.filter(r => r.department === selectedReq.department).forEach(r => {
        if (r.budget_items) {
            r.budget_items.forEach(i => {
                if (i.item_status === 'approved' && i.id !== itemId) {
                    totalUsedByDept += parseFloat(i.total_price) || 0;
                }
            });
        }
    });

    const allocatedBudget = departmentBudgets[selectedReq.department] || 0;
    currentModalContext = { deptUsedBudget: totalUsedByDept, deptAllocatedBudget: allocatedBudget };

    document.getElementById('modal-dept-name').innerText = selectedReq.department;
    document.getElementById('pb-text-used').innerText = `ใช้ไปแล้ว: ${totalUsedByDept.toLocaleString()} ฿`;
    
    if (allocatedBudget === 0) {
        document.getElementById('modal-budget-status').innerHTML = `<span class="text-red-500">ยังไม่ตั้งโควตางบ</span>`;
    } else {
        document.getElementById('modal-budget-status').innerText = `${totalUsedByDept.toLocaleString()} / ${allocatedBudget.toLocaleString()} ฿`;
    }

    document.getElementById('admin-item-id').value = selectedItem.id;
    document.getElementById('admin-qty').value = selectedItem.quantity;
    document.getElementById('admin-price').value = selectedItem.unit_price;
    document.getElementById('admin-discount').value = selectedItem.discount || 0;
    document.getElementById('admin-remark').value = selectedItem.remark || '';
    
    adminCalcTotal();
    document.getElementById('admin-edit-modal').classList.remove('hidden');
};

window.closeAdminEdit = () => { document.getElementById('admin-edit-modal').classList.add('hidden'); };

async function handleAdminSave(e) {
    e.preventDefault();
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    const itemId = document.getElementById('admin-item-id').value;
    const qty = parseFloat(document.getElementById('admin-qty').value) || 0;
    const price = parseFloat(document.getElementById('admin-price').value) || 0;
    const discount = parseFloat(document.getElementById('admin-discount').value) || 0;
    const total = parseFloat(document.getElementById('admin-total-price').value) || 0;
    
    const inputRemark = document.getElementById('admin-remark').value.trim();
    let finalRemark = inputRemark;
    
    let selectedItem = null;
    allRequests.forEach(req => { if (req.budget_items) { const item = req.budget_items.find(i => i.id === itemId); if (item) selectedItem = item; }});
    
    if (selectedItem && inputRemark !== selectedItem.remark && !inputRemark.includes('[ส่วนกลางตอบกลับ]')) {
        finalRemark = (selectedItem.remark ? selectedItem.remark + '\n\n' : '') + `[ส่วนกลางตอบกลับ]: ${inputRemark.replace(selectedItem.remark || '', '').trim()}`;
    }
    
    const payload = {
        quantity: qty,
        unit_price: price,
        discount: discount,
        total_price: total,
        remark: finalRemark,
        item_status: 'approved'
    };

    const { error } = await supabaseClient.from('budget_items').update(payload).eq('id', itemId);
    if (error) {
        Swal.fire('ข้อผิดพลาด', error.message, 'error');
    } else {
        closeAdminEdit();
        await fetchAdminBudgets();
        Swal.fire({ title: 'บันทึกสำเร็จ', icon: 'success', timer: 1500, showConfirmButton: false });
    }
}