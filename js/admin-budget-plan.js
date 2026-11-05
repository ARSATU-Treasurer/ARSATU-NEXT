// js/admin-budget-plan.js
let currentCampId = null;
let allRequests = [];
let filteredRequests = [];
let departmentBudgets = {};

// ตัวแปร Global สำหรับเก็บค่าคำนวณในแผงเครื่องคิดเลข
window.globalReqTotal = 0;
window.globalSavedTotal = 0;
window.globalNetTotal = 0;

let currentModalContext = { deptUsedBudget: 0, deptAllocatedBudget: 0 };

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
    container.innerHTML = '<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2"></i> โหลดข้อมูล...</div>';
    lucide.createIcons();

    try {
        const { data: budgetData } = await supabaseClient
            .from('department_ceilings')
            .select('*')
            .eq('camp_id', currentCampId);
            
        if (budgetData) {
            budgetData.forEach(b => departmentBudgets[b.department] = parseFloat(b.ceiling_amount) || 0);
        }

        // ดึงแฟ้มทั้งหมดและรายการของแต่ละแฟ้มมาจากฐานข้อมูลจริง
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
        container.innerHTML = `<p class="text-red-500 text-center py-10">ข้อผิดพลาด: ${err.message}</p>`;
    }
}

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
}

function updateSummary() {
    const submitted = allRequests.filter(r => r.status !== 'draft');
    
    let sumAllGross = 0;      // ยอดขอตั้งต้นทั้งหมด
    let sumApprovedNet = 0;   // ยอดที่อนุมัติแล้ว (สุทธิ)
    let sumPendingNet = 0;    // ยอดที่รอตรวจ (สุทธิ)
    let sumTotalSaved = 0;    // ยอดที่ตัดออก/ประหยัดได้ทั้งหมด

    // ดึงข้อมูล "ตัวเลขจริงๆ จากฐานข้อมูล" ที่ถูกประมวลผลก่อนหน้ามาสรุป
    submitted.forEach(req => {
        if (req.budget_items) {
            req.budget_items.forEach(item => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unit_price) || 0;
                const gross = qty * price;
                
                const isDenied = item.item_status === 'denied';
                const net = isDenied ? 0 : (parseFloat(item.total_price) || 0);
                const saved = gross - net;

                sumAllGross += gross;
                sumTotalSaved += saved;

                if (item.item_status === 'approved') sumApprovedNet += net;
                else if (item.item_status === 'pending') sumPendingNet += net;
            });
        }
    });

    window.globalReqTotal = sumAllGross;
    window.globalSavedTotal = sumTotalSaved;
    window.globalNetTotal = sumApprovedNet + sumPendingNet;

    if(document.getElementById('sum-all')) document.getElementById('sum-all').innerText = sumAllGross.toLocaleString('th-TH') + ' ฿';
    if(document.getElementById('sum-approved')) document.getElementById('sum-approved').innerText = sumApprovedNet.toLocaleString('th-TH') + ' ฿';
    if(document.getElementById('sum-denied')) document.getElementById('sum-denied').innerText = sumTotalSaved.toLocaleString('th-TH') + ' ฿';
    if(document.getElementById('sum-pending')) document.getElementById('sum-pending').innerText = sumPendingNet.toLocaleString('th-TH') + ' ฿';

    calculateTempBudget();
}

window.calculateTempBudget = function() {
    const inputEl = document.getElementById('temp-budget-input');
    if (!inputEl) return;

    const inputVal = parseFloat(inputEl.value) || 0;
    const balEl = document.getElementById('temp-balance');

    document.getElementById('temp-req-total').innerText = window.globalReqTotal.toLocaleString('th-TH');
    document.getElementById('temp-saved-total').innerText = window.globalSavedTotal.toLocaleString('th-TH');
    document.getElementById('temp-net-total').innerText = window.globalNetTotal.toLocaleString('th-TH');

    if (inputVal > 0) {
        const balance = inputVal - window.globalNetTotal;
        balEl.innerText = balance.toLocaleString('th-TH');
        if (balance < 0) {
            balEl.className = "text-sm font-extrabold text-red-600 mt-0.5";
        } else {
            balEl.className = "text-sm font-extrabold text-indigo-600 mt-0.5";
        }
    } else {
        balEl.innerText = '-';
        balEl.className = "text-sm font-extrabold text-gray-400 mt-0.5";
    }
}

// ระบบ Toggle เปิด/ปิด แฟ้ม
window.toggleFolder = function(reqId) {
    const content = document.getElementById(`items-${reqId}`);
    const icon = document.getElementById(`icon-${reqId}`);
    
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    } else {
        content.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
}

function renderRequests() {
    const container = document.getElementById('admin-request-list');
    container.innerHTML = '';

    if (filteredRequests.length === 0) {
        container.innerHTML = '<div class="text-center py-10 text-gray-400">ไม่พบรายการที่ตรงกับเงื่อนไข</div>';
        return;
    }

    filteredRequests.forEach(req => {
        let itemsHTML = '';
        let folderPendingTotal = 0; 
        let deptUsedTotal = 0; 
        
        let reqOriginalGross = 0; // ยอดขอตั้งต้นของแฟ้มนี้
        let reqTotalNet = 0;      // ยอดสุทธิของแฟ้มนี้
        let reqSaved = 0;         // ยอดที่ตัดออกของแฟ้มนี้

        allRequests.filter(r => r.department === req.department).forEach(r => {
            if (r.budget_items) {
                r.budget_items.forEach(i => {
                    if (i.item_status === 'approved') {
                        deptUsedTotal += parseFloat(i.total_price) || 0;
                    }
                });
            }
        });

        if (req.budget_items && req.budget_items.length > 0) {
            const sortedItems = req.budget_items.sort((a, b) => b.priority_level - a.priority_level);
            
            itemsHTML = sortedItems.map(item => {
                const isDenied = item.item_status === 'denied';
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unit_price) || 0;
                const gross = qty * price;
                const net = isDenied ? 0 : (parseFloat(item.total_price) || 0);

                reqOriginalGross += gross;
                reqTotalNet += net;

                const discountText = item.discount > 0 && !isDenied ? `<span class="text-red-500 ml-1 bg-red-50 px-1 rounded">-ลด ${parseFloat(item.discount).toLocaleString()} ฿</span>` : '';
                
                if (item.item_status === 'pending') folderPendingTotal += net;
                
                let actionBtns = '';
                if (item.item_status === 'pending') {
                    actionBtns = `
                        <button onclick="updateItemStatus('${item.id}', 'approved')" class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1.5 rounded-lg text-[11px] font-bold hover:bg-emerald-100 transition shadow-sm">อนุมัติ</button>
                        <button onclick="updateItemStatus('${item.id}', 'denied')" class="bg-red-50 text-red-700 border border-red-200 px-2 py-1.5 rounded-lg text-[11px] font-bold hover:bg-red-100 transition shadow-sm">ตัดทิ้ง</button>
                    `;
                } else {
                    const statusColor = item.item_status === 'approved' ? 'text-emerald-600' : 'text-red-600';
                    const statusText = item.item_status === 'approved' ? 'อนุมัติแล้ว' : 'ถูกตัดทิ้ง';
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
                            ${isDenied ? `<s class="text-red-500">${item.item_name}</s>` : item.item_name}
                        </p>
                        <p class="text-xs text-gray-500 mt-1">${qty} x ${price.toLocaleString()} ฿ ${discountText}</p>
                        ${item.remark ? `<p class="text-[11px] text-gray-600 mt-1.5 bg-yellow-50/50 p-2 rounded-lg border border-yellow-100"><b>โน้ต:</b> ${item.remark.replace(/\n/g, '<br>')}</p>` : ''}
                    </div>
                    <div class="text-right shrink-0">
                        <p class="text-sm font-extrabold text-gray-800 mb-2">${net.toLocaleString()} ฿</p>
                        <div class="flex flex-col gap-1.5 items-end">
                            <div class="flex gap-1.5">${actionBtns}</div>
                            <button onclick="openAdminEdit('${item.id}')" class="text-[10px] text-indigo-600 font-bold bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg hover:bg-indigo-100 transition shadow-sm mt-1">แก้ราคา</button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } else {
            itemsHTML = '<p class="text-sm text-gray-400 text-center py-2">ไม่มีรายการ</p>';
        }

        reqSaved = reqOriginalGross - reqTotalNet;

        let folderProgressHtml = '';
        const deptCeiling = departmentBudgets[req.department] || 0;
        
        if (req.status === 'pending') {
            if (deptCeiling === 0) {
                folderProgressHtml = `
                    <div class="bg-orange-50 p-3 rounded-xl border border-orange-200 mb-4 shadow-sm text-center">
                        <span class="text-xs font-bold text-orange-700"><i data-lucide="alert-circle" class="w-4 h-4 inline mb-0.5"></i> ฝ่าย ${req.department}</span>
                        <p class="text-[10px] text-orange-600 mt-1">ยังไม่ได้ตั้งเพดานงบให้ฝ่ายนี้ในระบบ</p>
                    </div>
                `;
            } else {
                let usedPct = (deptUsedTotal / deptCeiling) * 100;
                let pendingPct = (folderPendingTotal / deptCeiling) * 100;
                let remaining = deptCeiling - deptUsedTotal - folderPendingTotal;

                if (usedPct > 100) usedPct = 100;
                if (usedPct + pendingPct > 100) pendingPct = 100 - usedPct;

                const isOver = (deptUsedTotal + folderPendingTotal) > deptCeiling;
                const barColor = isOver ? 'bg-red-500' : 'bg-indigo-500';
                const remainColor = isOver ? 'text-red-600' : 'text-emerald-600';
                const remainText = isOver ? `เกินงบ: ${Math.abs(remaining).toLocaleString()} ฿!` : `เหลืองบ: ${remaining.toLocaleString()} ฿`;

                folderProgressHtml = `
                    <div class="bg-indigo-50/40 p-3 rounded-xl border border-indigo-100 mb-4 shadow-sm">
                        <div class="flex justify-between items-end mb-2">
                            <span class="text-[10px] font-extrabold text-indigo-900 flex items-center gap-1"><i data-lucide="bar-chart-2" class="w-3.5 h-3.5"></i> วิเคราะห์งบฝ่าย ${req.department}</span>
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
                            <span class="text-[9px] font-extrabold text-indigo-600">รพิจารณา: +${folderPendingTotal.toLocaleString()} ฿</span>
                            <span class="text-[9px] font-bold ${remainColor}">${remainText}</span>
                        </div>
                    </div>
                `;
            }
        }

        const reqStatusHtml = req.status === 'pending' 
            ? '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold border border-blue-200">รอตรวจ</span>'
            : '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold border border-emerald-200">ตรวจแล้ว</span>';

        // เช็คว่าย่อแฟ้ม (ถ้าสถานะ reviewed ให้ย่อแฟ้มอัตโนมัติ)
        const isCollapsed = req.status === 'reviewed';
        
        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-5 transition-all duration-300";
        card.innerHTML = `
            <div class="bg-gray-50 p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors" onclick="toggleFolder('${req.id}')">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1.5">
                            ${reqStatusHtml}
                            <span class="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 rounded font-bold">${req.department}</span>
                        </div>
                        <h3 class="font-bold text-gray-900 text-base leading-tight flex items-center gap-2">
                            ${req.topic_name}
                        </h3>
                        <p class="text-[11px] text-gray-500 mt-1">ผู้เสนอ: ${req.owner?.full_name}</p>
                        
                        <div class="flex items-center gap-3 mt-2 text-[11px] font-medium bg-white p-2 rounded-lg border border-gray-100 inline-flex shadow-sm">
                            <span class="text-gray-500">ยอดตั้งต้น: <br class="sm:hidden">${reqOriginalGross.toLocaleString()} ฿</span>
                            <span class="text-red-500 border-l border-gray-200 pl-3">ตัดออก: <br class="sm:hidden">-${reqSaved.toLocaleString()} ฿</span>
                        </div>
                    </div>
                    <div class="text-right shrink-0 ml-2">
                        <span class="block text-xl font-extrabold text-emerald-600">${reqTotalNet.toLocaleString()} ฿</span>
                        <span class="text-[10px] text-gray-400 flex items-center justify-end gap-1 mt-0.5">ยอดสุทธิ <i id="icon-${req.id}" data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}"></i></span>
                    </div>
                </div>
            </div>
            <div id="items-${req.id}" class="${isCollapsed ? 'hidden' : 'block'}">
                <div class="p-4">
                    ${folderProgressHtml} ${itemsHTML}
                </div>
                ${req.status === 'pending' ? `
                <div class="p-3 bg-gray-50 border-t border-gray-100">
                    <button onclick="markRequestReviewed('${req.id}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-bold shadow-sm transition flex justify-center items-center gap-1.5"><i data-lucide="check-circle" class="w-4 h-4"></i> ตรวจแฟ้มนี้เสร็จสิ้น</button>
                </div>
                ` : ''}
            </div>
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
}

window.markRequestReviewed = async (reqId) => {
    await supabaseClient.from('budget_requests').update({ status: 'reviewed' }).eq('id', reqId);
    fetchAdminBudgets();
    Swal.fire({ title: 'บันทึกสำเร็จ', icon: 'success', timer: 1500, showConfirmButton: false });
}

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
            document.getElementById('pb-text-remain').innerText = `เกินงบ: ${(used + total - alloc).toLocaleString()} ฿`;
        } else {
            document.getElementById('pb-current').classList.replace('bg-red-500', 'bg-indigo-500');
            document.getElementById('pb-text-remain').classList.replace('text-red-600', 'text-emerald-600');
            document.getElementById('pb-text-remain').innerText = `เหลืองบ: ${remaining.toLocaleString()} ฿`;
        }
        
        document.getElementById('pb-text-current').innerText = `+ รายการนี้: ${total.toLocaleString()} ฿`;
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
    document.getElementById('pb-text-used').innerText = `อนุมัติไปแล้ว: ${totalUsedByDept.toLocaleString()} ฿`;
    
    if (allocatedBudget === 0) {
        document.getElementById('modal-budget-status').innerHTML = `<span class="text-red-500">ไม่ได้ตั้งเพดาน</span>`;
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
}

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
    
    if (selectedItem && inputRemark !== selectedItem.remark && !inputRemark.includes('[แอดมิน]')) {
        finalRemark = (selectedItem.remark ? selectedItem.remark + '\n\n' : '') + `[แอดมิน]: ${inputRemark.replace(selectedItem.remark || '', '').trim()}`;
    }
    
    const payload = {
        quantity: qty,
        unit_price: price,
        discount: discount,
        total_price: total,
        remark: finalRemark,
        item_status: 'approved' // เมื่อแก้ราคาแล้ว ถือว่าอนุมัติเลย
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