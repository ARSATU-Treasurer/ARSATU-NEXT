// js/budget-plan.js
let currentUserId = null;
let userProfile = null;
let currentCampId = null;
let allRequests = [];
let deptUsers = []; // เก็บรายชื่อคนในฝ่ายเดียวกันสำหรับทำ Collaborator

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    currentUserId = session.user.id;

    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', currentUserId).single();
    if (!profile) return window.location.href = '../index.html';
    
    if (!profile.default_department && profile.role !== 'admin') {
        await Swal.fire({ title: 'ยังไม่มีสังกัดฝ่าย!', text: 'กรุณาติดต่อแอดมิน', icon: 'warning' });
        return window.location.href = 'dashboard.html';
    }
    userProfile = profile;

    if (userProfile.role === 'admin') {
        document.getElementById('admin-dept-container').classList.remove('hidden');
    }

    // 🌟 โหลดรายชื่อคนในฝ่ายเดียวกันมาเตรียมไว้สำหรับระบบ Collaborator
    if (userProfile.default_department) {
        const { data: usersData } = await supabaseClient.from('profiles')
            .select('id, full_name')
            .eq('default_department', userProfile.default_department)
            .neq('id', currentUserId); // ไม่ต้องเอาตัวเองมา
        deptUsers = usersData || [];
    }

    const { data: camp } = await supabaseClient.from('camps').select('*').eq('is_active', true).single();
    if (!camp) return Swal.fire('Error', 'ไม่มีโครงการปัจจุบัน', 'warning');
    currentCampId = camp.id;

    document.getElementById('request-form').addEventListener('submit', handleSaveRequest);
    document.getElementById('item-form').addEventListener('submit', handleSaveItem);

    fetchBudgetRequests();
});

// ==========================================
// 🔄 ระบบดึงข้อมูล
// ==========================================
async function fetchBudgetRequests() {
    const container = document.getElementById('budget-list-container');
    container.innerHTML = '<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto"></i></div>';
    lucide.createIcons();

    try {
        let query = supabaseClient.from('budget_requests').select(`*, owner:profiles!owner_id(full_name), budget_items(*)`).eq('camp_id', currentCampId).order('created_at', { ascending: false });

        if (userProfile.role !== 'admin') {
            query = query.eq('department', userProfile.default_department);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        allRequests = data || [];
        renderRequests();
    } catch (err) {
        container.innerHTML = `<p class="text-red-500 text-center">เกิดข้อผิดพลาด: ${err.message}</p>`;
    }
}

function renderRequests() {
    const container = document.getElementById('budget-list-container');
    container.innerHTML = '';
    let grandTotal = 0;
    
    // 🌟 ตัวแปรสำหรับนับจำนวนของที่โดนแอดมินตัดหรือแก้
    let deniedCount = 0;
    let adminEditedCount = 0;

    if (allRequests.length === 0) {
        container.innerHTML = `<div class="text-center py-10 border border-dashed rounded-2xl text-gray-400">ยังไม่มีแฟ้มงบประมาณ</div>`;
        document.getElementById('total-requests-count').innerHTML = `0 <span class="text-sm font-normal text-gray-400">แฟ้ม</span>`;
        document.getElementById('total-budget-amount').innerHTML = `0.00 <span class="text-sm font-normal text-gray-400">฿</span>`;
        return;
    }

    // 🌟 ลูปแรก: ตรวจสอบและนับรายการที่โดนตัด/โดนแก้ เพื่อทำแจ้งเตือน
    allRequests.forEach(req => {
        if (req.status === 'reviewed' && req.budget_items) {
            req.budget_items.forEach(item => {
                if (item.item_status === 'denied') deniedCount++;
                if (item.remark && item.remark.includes('[ส่วนกลางตอบกลับ]')) adminEditedCount++;
            });
        }
    });

    // 🌟 วาดป้ายแจ้งเตือน (Alert Banner) ถ้ามีการตัดงบหรือแก้ตัวเลข
    if (deniedCount > 0 || adminEditedCount > 0) {
        const alertHtml = `
            <div class="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex gap-3 items-start shadow-sm animate-pulse">
                <div class="bg-red-100 p-2 rounded-full text-red-600 shrink-0"><i data-lucide="alert-triangle" class="w-5 h-5"></i></div>
                <div>
                    <h4 class="font-bold text-red-800 text-sm">ส่วนกลางตรวจสอบและปรับลดงบประมาณแล้ว!</h4>
                    <p class="text-xs text-red-600 mt-1">พบรายการถูกตัดทิ้ง <b>${deniedCount}</b> รายการ และมีการขอปรับลดตัวเลข <b>${adminEditedCount}</b> รายการ กรุณาตรวจสอบแฟ้มที่สถานะ "ตรวจแล้ว"</p>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', alertHtml);
    }

    // วาดการ์ดแฟ้มตามปกติ
    allRequests.forEach(req => {
        const isOwner = req.owner_id === currentUserId;
        const isCoWorker = req.co_worker_ids && req.co_worker_ids.includes(currentUserId);
        const hasAccess = isOwner || isCoWorker || userProfile.role === 'admin';
        
        const reqTotal = (req.budget_items || []).reduce((sum, item) => item.item_status !== 'denied' ? sum + parseFloat(item.total_price) : sum, 0);
        grandTotal += reqTotal;

        const statusConfig = {
            'draft': '<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">ร่าง (Draft)</span>',
            'pending': '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">รอตรวจ</span>',
            'reviewed': '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">ตรวจแล้ว</span>'
        };

        // 🌟 เช็คว่าแฟ้มนี้มีโดนตัดงบไหม ถ้ามีจะทำกรอบสีแดงให้สังเกตง่ายๆ
        let hasIssueInFolder = false;

        let itemsHTML = '';
        if (req.budget_items && req.budget_items.length > 0) {
            const sortedItems = req.budget_items.sort((a, b) => b.priority_level - a.priority_level);
            itemsHTML = sortedItems.map(item => {
                const isDenied = item.item_status === 'denied';
                const isAdminEdited = item.remark && item.remark.includes('[ส่วนกลางตอบกลับ]');
                if ((isDenied || isAdminEdited) && req.status === 'reviewed') hasIssueInFolder = true;

                const discountText = item.discount > 0 ? `<span class="text-red-500 ml-1 bg-red-50 px-1 rounded">-ลด ${parseFloat(item.discount).toLocaleString()} ฿</span>` : '';
                
                // ไฮไลท์หมายเหตุแอดมินให้ชัดขึ้น
                const remarkHtml = item.remark ? `<p class="text-[10px] mt-1.5 p-1.5 rounded-lg ${isAdminEdited ? 'bg-red-50 text-red-700 border border-red-100 font-bold' : 'bg-gray-50 text-gray-500'}">หมายเหตุจากแอดมิน: ${item.remark.replace(/\n/g, '<br>')}</p>` : '';
                return `
                <div class="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 ${isDenied ? 'opacity-50 bg-gray-50 p-2 rounded-lg' : ''}">
                    <div class="flex-1 pr-2">
                        <p class="text-sm font-bold text-gray-700 flex items-center gap-1">
                            <span class="text-[10px] bg-pink-50 text-pink-600 border border-pink-100 px-1.5 rounded flex items-center gap-0.5"><i data-lucide="heart" class="w-2.5 h-2.5 fill-current"></i> ${item.priority_level}</span>
                            ${isDenied ? `<s class="text-red-500">${item.item_name}</s> <span class="text-[9px] text-red-600 bg-red-100 px-1 rounded border border-red-200">ไม่อนุมัติ</span>` : item.item_name}
                        </p>
                        <p class="text-[10px] text-gray-500 mt-0.5">${item.quantity} x ${parseFloat(item.unit_price).toLocaleString()} ฿ ${discountText}</p>
                        ${remarkHtml}
                    </div>
                    <div class="text-right shrink-0 ml-2 flex flex-col items-end">
                        <p class="text-sm font-extrabold text-gray-800">${parseFloat(item.total_price).toLocaleString()} ฿</p>
                        ${req.status === 'draft' && hasAccess ? `<div class="flex gap-1 mt-1"><button onclick="editItem('${item.id}', '${req.id}')" class="text-[10px] text-blue-600 hover:underline bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">แก้ไข</button><button onclick="deleteItem('${item.id}')" class="text-[10px] text-red-500 hover:underline bg-red-50 border border-red-100 px-2 py-0.5 rounded-md">ลบทิ้ง</button></div>` : ''}
                    </div>
                </div>`;
            }).join('');
        } else {
            itemsHTML = '<p class="text-xs text-gray-400 text-center py-2">ยังไม่มีรายการสิ่งของในแฟ้มนี้</p>';
        }

        let actionBtn = '';
        let exportBtnHtml = `<button onclick="exportBudgetExcel('${req.id}')" class="w-full mt-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold py-2 rounded-lg border border-blue-200 flex justify-center items-center gap-1 transition"><i data-lucide="file-down" class="w-3.5 h-3.5"></i> ดาวน์โหลดข้อมูล (Excel)</button>`;

        if (req.status === 'draft' && hasAccess) {
            actionBtn = `
                <div class="flex gap-2 mb-2">
                    <button onclick="openItemModal('${req.id}')" class="flex-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold py-2 rounded-lg border border-purple-200 flex justify-center items-center gap-1 transition"><i data-lucide="plus" class="w-3.5 h-3.5"></i> เพิ่มรายการ</button>
                    <button onclick="triggerImportExcel('${req.id}')" class="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold py-2 rounded-lg border border-emerald-200 flex justify-center items-center gap-1 transition" title="นำเข้าข้อมูลจาก Excel"><i data-lucide="file-up" class="w-3.5 h-3.5"></i> นำเข้า</button>
                    ${isOwner || userProfile.role === 'admin' ? `<button onclick="openCollabModal('${req.id}')" class="bg-white hover:bg-gray-50 text-indigo-600 border border-indigo-200 px-3 rounded-lg flex items-center gap-1 transition shadow-sm text-[11px] font-bold" title="เพิ่มผู้ช่วย"><i data-lucide="user-plus" class="w-3.5 h-3.5"></i> ผู้ช่วย</button>` : ''}
                </div>
                <button onclick="submitRequest('${req.id}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-lg shadow-sm flex justify-center items-center gap-1 transition"><i data-lucide="send" class="w-3.5 h-3.5"></i> ส่งแฟ้มตรวจ</button>
                ${exportBtnHtml}
            `;
        } else if (req.status === 'pending' && hasAccess) {
            actionBtn = `
                <button onclick="recallRequest('${req.id}')" class="w-full bg-orange-50 text-orange-600 text-xs font-bold py-2 rounded-lg border border-orange-100 flex justify-center items-center gap-1"><i data-lucide="rotate-ccw" class="w-3.5 h-3.5 inline"></i> ดึงกลับมาแก้ไข (Recall)</button>
                ${exportBtnHtml}
            `;
        } else {
            actionBtn = exportBtnHtml;
        }

        const collabBadge = req.co_worker_ids && req.co_worker_ids.length > 0
            ? `<span class="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 rounded-md flex items-center gap-1 border border-indigo-100"><i data-lucide="users" class="w-3 h-3"></i> +${req.co_worker_ids.length}</span>` 
            : '';

        // ถ้าแฟ้มนี้มีปัญหา (โดนตัดงบ) จะเปลี่ยนสีขอบการ์ดเป็นสีแดงอ่อนให้เตะตา
        const cardBorderClass = hasIssueInFolder ? 'border-red-300 shadow-md ring-2 ring-red-50' : 'border-gray-200 shadow-sm';

        const card = `
            <div class="bg-white rounded-2xl border ${cardBorderClass} overflow-hidden mb-4 transition-all duration-300">
                <div class="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center cursor-pointer" onclick="document.getElementById('items-${req.id}').classList.toggle('hidden')">
                    <div>
                        <div class="flex items-center gap-2 mb-1.5">
                            ${statusConfig[req.status]}
                            <span class="text-[10px] font-bold text-indigo-600 border border-indigo-100 bg-indigo-50 px-1.5 rounded">${req.department}</span>
                            ${collabBadge}
                        </div>
                        <h3 class="font-bold text-gray-800 text-base flex items-center gap-2">
                            ${req.topic_name}
                            ${hasIssueInFolder ? '<i data-lucide="alert-circle" class="w-4 h-4 text-red-500"></i>' : ''}
                        </h3>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-extrabold text-purple-600">${reqTotal.toLocaleString()} ฿</p>
                        <i data-lucide="chevron-down" class="w-4 h-4 text-gray-400 inline"></i>
                    </div>
                </div>
                <div id="items-${req.id}" class="p-4 ${req.status==='draft' ? 'block' : 'hidden'}">
                    <div class="bg-white rounded-xl border border-gray-100 p-3 mb-3">
                        ${itemsHTML}
                    </div>
                    ${actionBtn}
                </div>
            </div>`;
        container.insertAdjacentHTML('beforeend', card);
    });

    document.getElementById('total-requests-count').innerHTML = `${allRequests.length} <span class="text-sm font-normal text-gray-400">แฟ้ม</span>`;
    document.getElementById('total-budget-amount').innerHTML = `${grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2})} <span class="text-sm font-normal text-gray-400">฿</span>`;
    lucide.createIcons();
}

// ==========================================
// 👥 ระบบจัดการผู้ร่วมแก้ไข (Collaborators)
// ==========================================
window.openCollabModal = async function(reqId) {
    document.getElementById('collab-request-id').value = reqId;
    const req = allRequests.find(r => r.id === reqId);
    
    // โชว์ Loading ก่อนระหว่างดึงข้อมูล
    const select = document.getElementById('collab-select');
    select.innerHTML = '<option value="" disabled selected>กำลังโหลดรายชื่อ...</option>';
    document.getElementById('collab-modal').classList.remove('hidden');

    try {
        // 🌟 ดึงข้อมูลเพื่อนใน "ฝ่ายเดียวกับแฟ้มนี้" สดๆ จาก Database
        const { data: usersData, error } = await supabaseClient.from('profiles')
            .select('id, full_name')
            .eq('default_department', req.department)
            .neq('id', currentUserId); // ไม่เอาตัวเองมาโชว์

        if (error) throw error;

        select.innerHTML = '<option value="" disabled selected>-- เลือกสมาชิก --</option>';
        
        if (usersData && usersData.length > 0) {
            usersData.forEach(u => {
                select.innerHTML += `<option value="${u.id}">${u.full_name}</option>`;
            });
            deptUsers = usersData; // เก็บไว้ใช้ตอน render list
        } else {
            select.innerHTML = '<option value="" disabled selected>ไม่พบสมาชิกอื่นในฝ่ายนี้</option>';
            deptUsers = [];
        }
    } catch (err) {
        select.innerHTML = '<option value="" disabled selected>เกิดข้อผิดพลาดในการดึงข้อมูล</option>';
        console.error("Error fetching users:", err);
    }

    renderCollabList(reqId);
}

window.closeCollabModal = function() { document.getElementById('collab-modal').classList.add('hidden'); }

async function renderCollabList(reqId) {
    const req = allRequests.find(r => r.id === reqId);
    const list = document.getElementById('collab-list');
    list.innerHTML = '';
    
    if (!req.co_worker_ids || req.co_worker_ids.length === 0) {
        list.innerHTML = '<li class="text-xs text-gray-400 py-4 text-center border border-dashed rounded-xl">ยังไม่มีผู้ช่วย (คุณสามารถแก้ไขแฟ้มนี้ได้คนเดียว)</li>';
        return;
    }

    req.co_worker_ids.forEach(uuid => {
        // หาชื่อจาก deptUsers ถ้าไม่เจอให้ลองขึ้นว่า "สมาชิก (ดึงชื่อไม่ได้)"
        const user = deptUsers.find(u => u.id === uuid) || { full_name: 'สมาชิก (รอโหลดข้อมูล)' };
        list.innerHTML += `
            <li class="flex justify-between items-center bg-indigo-50 p-2.5 rounded-xl border border-indigo-100">
                <span class="text-sm font-bold text-indigo-900 flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-indigo-500"></i> ${user.full_name}</span>
                <button onclick="removeCollaborator('${uuid}')" class="text-red-500 hover:text-red-700 bg-white p-1.5 rounded-lg shadow-sm border border-red-100 transition"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </li>
        `;
    });
    lucide.createIcons();
}

window.addCollaborator = async function() {
    const reqId = document.getElementById('collab-request-id').value;
    const newUserId = document.getElementById('collab-select').value;
    if (!newUserId) return;

    const req = allRequests.find(r => r.id === reqId);
    let coWorkers = req.co_worker_ids || [];
    
    if (coWorkers.includes(newUserId)) return Swal.fire('แจ้งเตือน', 'คุณเพิ่มสมาชิกคนนี้แล้ว', 'warning');
    coWorkers.push(newUserId);
    
    Swal.fire({title: 'กำลังเพิ่ม...', didOpen: ()=>Swal.showLoading()});
    const { error } = await supabaseClient.from('budget_requests').update({ co_worker_ids: coWorkers }).eq('id', reqId);
    
    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.close();
    
    req.co_worker_ids = coWorkers;
    renderCollabList(reqId);
    fetchBudgetRequests();
}

window.removeCollaborator = async function(userId) {
    const reqId = document.getElementById('collab-request-id').value;
    const req = allRequests.find(r => r.id === reqId);
    let coWorkers = req.co_worker_ids || [];
    
    coWorkers = coWorkers.filter(id => id !== userId);
    
    Swal.fire({title: 'กำลังลบ...', didOpen: ()=>Swal.showLoading()});
    const { error } = await supabaseClient.from('budget_requests').update({ co_worker_ids: coWorkers }).eq('id', reqId);
    
    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.close();
    
    req.co_worker_ids = coWorkers;
    renderCollabList(reqId);
    fetchBudgetRequests();
}

window.closeCollabModal = function() { document.getElementById('collab-modal').classList.add('hidden'); }

async function renderCollabList(reqId) {
    const req = allRequests.find(r => r.id === reqId);
    const list = document.getElementById('collab-list');
    list.innerHTML = '';
    
    if (!req.co_worker_ids || req.co_worker_ids.length === 0) {
        list.innerHTML = '<li class="text-xs text-gray-400 py-4 text-center border border-dashed rounded-xl">ยังไม่มีผู้ช่วย (คุณสามารถแก้ไขแฟ้มนี้ได้คนเดียว)</li>';
        return;
    }

    req.co_worker_ids.forEach(uuid => {
        const user = deptUsers.find(u => u.id === uuid) || { full_name: 'สมาชิก' };
        list.innerHTML += `
            <li class="flex justify-between items-center bg-indigo-50 p-2.5 rounded-xl border border-indigo-100">
                <span class="text-sm font-bold text-indigo-900 flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-indigo-500"></i> ${user.full_name}</span>
                <button onclick="removeCollaborator('${uuid}')" class="text-red-500 hover:text-red-700 bg-white p-1.5 rounded-lg shadow-sm border border-red-100"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
            </li>
        `;
    });
    lucide.createIcons();
}

window.addCollaborator = async function() {
    const reqId = document.getElementById('collab-request-id').value;
    const newUserId = document.getElementById('collab-select').value;
    if (!newUserId) return;

    const req = allRequests.find(r => r.id === reqId);
    let coWorkers = req.co_worker_ids || [];
    
    if (coWorkers.includes(newUserId)) return Swal.fire('แจ้งเตือน', 'เพิ่มสมาชิกคนนี้ไปแล้ว', 'warning');
    coWorkers.push(newUserId);
    
    // โชว์โหลดป้องกดเบิ้ล
    Swal.fire({title: 'กำลังเพิ่ม...', didOpen: ()=>Swal.showLoading()});
    const { error } = await supabaseClient.from('budget_requests').update({ co_worker_ids: coWorkers }).eq('id', reqId);
    
    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.close();
    
    req.co_worker_ids = coWorkers;
    renderCollabList(reqId);
    fetchBudgetRequests();
}

window.removeCollaborator = async function(userId) {
    const reqId = document.getElementById('collab-request-id').value;
    const req = allRequests.find(r => r.id === reqId);
    let coWorkers = req.co_worker_ids || [];
    
    coWorkers = coWorkers.filter(id => id !== userId);
    
    Swal.fire({title: 'กำลังลบ...', didOpen: ()=>Swal.showLoading()});
    const { error } = await supabaseClient.from('budget_requests').update({ co_worker_ids: coWorkers }).eq('id', reqId);
    
    if (error) return Swal.fire('Error', error.message, 'error');
    Swal.close();
    
    req.co_worker_ids = coWorkers;
    renderCollabList(reqId);
    fetchBudgetRequests();
}

// ==========================================
// 📁 การจัดการแฟ้มหลัก
// ==========================================
function openRequestModal() { document.getElementById('request-form').reset(); document.getElementById('request-modal').classList.remove('hidden'); }
function closeRequestModal() { document.getElementById('request-modal').classList.add('hidden'); }

async function handleSaveRequest(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-request');
    btn.disabled = true; btn.innerHTML = 'กำลังสร้าง...';

    let deptToSave = userProfile.default_department;
    if (userProfile.role === 'admin') {
        const inputDept = document.getElementById('request-department').value;
        if (!inputDept) {
            btn.disabled = false; btn.innerHTML = 'สร้างแฟ้ม';
            return Swal.fire('แจ้งเตือน', 'กรุณาเลือกฝ่ายที่ต้องการสร้าง', 'warning');
        }
        deptToSave = inputDept;
    }

    const payload = {
        camp_id: currentCampId,
        department: deptToSave,
        topic_name: document.getElementById('request-topic').value.trim(),
        owner_id: currentUserId,
        status: 'draft',
        co_worker_ids: [] // กำหนด array ว่างเริ่มต้น
    };

    const { error } = await supabaseClient.from('budget_requests').insert([payload]);
    btn.disabled = false; btn.innerHTML = 'สร้างแฟ้ม';
    
    if (error) return Swal.fire('Error', error.message, 'error');
    closeRequestModal(); fetchBudgetRequests();
}

async function submitRequest(reqId) {
    const req = allRequests.find(r => r.id === reqId);
    if (!req.budget_items || req.budget_items.length === 0) return Swal.fire('ส่งไม่ได้', 'กรุณาเพิ่มรายการสิ่งของอย่างน้อย 1 อย่าง', 'warning');
    const { isConfirmed } = await Swal.fire({ title: 'ส่งแฟ้มให้ส่วนกลาง?', icon: 'question', showCancelButton: true });
    if (isConfirmed) {
        Swal.fire({title: 'กำลังส่ง...', didOpen: ()=>Swal.showLoading()});
        await supabaseClient.from('budget_requests').update({ status: 'pending' }).eq('id', reqId);
        await supabaseClient.from('budget_items').update({ item_status: 'pending' }).eq('request_id', reqId);
        Swal.fire('สำเร็จ', 'ส่งแฟ้มเรียบร้อย', 'success'); fetchBudgetRequests();
    }
}

async function recallRequest(reqId) {
    await supabaseClient.from('budget_requests').update({ status: 'draft' }).eq('id', reqId);
    await supabaseClient.from('budget_items').update({ item_status: 'pending' }).eq('request_id', reqId);
    fetchBudgetRequests();
}

// ==========================================
// 💖 ระบบหัวใจเรทติ้ง
// ==========================================
window.setHeartPriority = function(val) {
    document.getElementById('item-priority').value = val;
    document.querySelectorAll('.heart-btn').forEach(btn => {
        if (parseInt(btn.getAttribute('data-val')) <= val) {
            btn.classList.replace('text-gray-300', 'text-pink-500');
        } else {
            btn.classList.replace('text-pink-500', 'text-gray-300');
        }
    });
    const texts = {1: "ระดับ 1: น้อยที่สุด", 2: "ระดับ 2: น้อย", 3: "ระดับ 3: ปานกลาง (ปรับลดได้)", 4: "ระดับ 4: สำคัญมาก", 5: "ระดับ 5: สำคัญสูงสุด (ห้ามตัด)"};
    document.getElementById('priority-text').innerText = texts[val];
}

// ==========================================
// 📝 การจัดการรายการย่อย (มีระบบส่วนลด)
// ==========================================
function calcTotal() {
    const qty = parseFloat(document.getElementById('item-quantity').value) || 0;
    const price = parseFloat(document.getElementById('item-unit-price').value) || 0;
    const discount = parseFloat(document.getElementById('item-discount').value) || 0;
    
    // หักส่วนลดรวม
    let total = (qty * price) - discount;
    if (total < 0) total = 0;
    
    document.getElementById('item-total-price').value = total;
    document.getElementById('item-total-display').innerText = total.toLocaleString('th-TH', {minimumFractionDigits: 2});
}

function openItemModal(reqId) {
    document.getElementById('item-form').reset();
    document.getElementById('item-id').value = '';
    document.getElementById('parent-request-id').value = reqId;
    document.getElementById('item-discount').value = 0; // รีเซ็ตส่วนลด
    
    const titleEl = document.getElementById('item-modal-title');
    if(titleEl) titleEl.innerText = 'เพิ่มรายการใหม่';
    
    setHeartPriority(3);
    calcTotal();
    document.getElementById('item-modal').classList.remove('hidden');
}

window.editItem = function(itemId, reqId) {
    const req = allRequests.find(r => r.id === reqId);
    if (!req) return;
    const item = req.budget_items.find(i => i.id === itemId);
    if (!item) return;

    document.getElementById('item-form').reset();
    document.getElementById('item-id').value = item.id;
    document.getElementById('parent-request-id').value = reqId;
    
    document.getElementById('item-name').value = item.item_name;
    document.getElementById('item-quantity').value = item.quantity;
    document.getElementById('item-unit-price').value = item.unit_price;
    document.getElementById('item-discount').value = item.discount || 0;
    document.getElementById('item-remark').value = item.remark || '';
    
    const titleEl = document.getElementById('item-modal-title');
    if(titleEl) titleEl.innerText = 'แก้ไขรายการ';
    
    setHeartPriority(item.priority_level || 3);
    calcTotal();
    
    document.getElementById('item-modal').classList.remove('hidden');
};

function closeItemModal() {
    document.getElementById('item-modal').classList.add('hidden');
}

async function handleSaveItem(e) {
    e.preventDefault();
    const reqId = document.getElementById('parent-request-id').value;
    const itemId = document.getElementById('item-id').value;
    
    // สร้าง Payload ข้อมูลที่ต้องการเซฟ
    const payload = {
        request_id: reqId,
        item_name: document.getElementById('item-name').value.trim(),
        quantity: parseFloat(document.getElementById('item-quantity').value),
        unit_price: parseFloat(document.getElementById('item-unit-price').value),
        discount: parseFloat(document.getElementById('item-discount').value) || 0,
        total_price: parseFloat(document.getElementById('item-total-price').value),
        priority_level: parseInt(document.getElementById('item-priority').value),
        remark: document.getElementById('item-remark').value.trim(),
        item_status: 'pending'
    };

    Swal.fire({title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});

    let error;
    if (itemId) {
        // อัปเดตรายการเดิม
        const res = await supabaseClient.from('budget_items').update(payload).eq('id', itemId);
        error = res.error;
    } else {
        // เพิ่มรายการใหม่
        const res = await supabaseClient.from('budget_items').insert([payload]);
        error = res.error;
    }

    if (error) {
        Swal.fire('Error', error.message, 'error');
        return;
    }
    
    Swal.close();
    closeItemModal();
    fetchBudgetRequests();
}

async function deleteItem(itemId) {
    if (confirm('ลบรายการนี้ทิ้ง?')) {
        await supabaseClient.from('budget_items').delete().eq('id', itemId);
        fetchBudgetRequests();
    }
}

// ==========================================
// 📊 ระบบ Import / Export Excel
// ==========================================
window.exportBudgetExcel = function(reqId) {
    const req = allRequests.find(r => r.id === reqId);
    if (!req) return;

    let total = 0, approved = 0, denied = 0, pending = 0;
    const items = req.budget_items || [];

    const wb = XLSX.utils.book_new();
    const wsData = [];

    // Header (แถวที่ 1: A-H และ J-K)
    wsData.push(["ลำดับ", "รายการสิ่งของ", "ระดับความสำคัญ (1-5)", "จำนวน", "ราคา/หน่วย", "ส่วนลด", "ราคาสุทธิ", "หมายเหตุ", "", "สรุปยอดงบประมาณ", "จำนวนเงิน (บาท)"]);

    // วนลูปข้อมูลเขียนลงคอลัมน์ A ถึง H
    items.forEach((item, index) => {
        const netPrice = parseFloat(item.total_price) || 0;
        total += netPrice;
        
        if (item.item_status === 'approved') approved += netPrice;
        else if (item.item_status === 'denied') denied += netPrice;
        else pending += netPrice;

        wsData.push([
            index + 1,
            item.item_name,
            item.priority_level || 3,
            item.quantity,
            item.unit_price,
            item.discount || 0,
            netPrice,
            item.remark || ''
        ]);
    });

    // ตรวจสอบความยาวของแถวเพื่อเติมข้อมูลสรุปลงไปใน J และ K
    // ถ้าแถวในระบบมีน้อยกว่า 4 แถว (แถวที่ 1-4) จะต้องเติมแถวว่างก่อน
    for(let i = 1; i <= 4; i++) {
        if (!wsData[i]) wsData[i] = [];
        // สร้างช่องว่างให้ครบถึงคอลัมน์ I (Index 8)
        while(wsData[i].length < 9) wsData[i].push("");
    }

    // เขียนข้อมูลสรุปลงใน J (Index 9) และ K (Index 10)
    wsData[1][9] = "ยอดขอเบิกรวม";     wsData[1][10] = total;
    wsData[2][9] = "ยอดที่อนุมัติ";     wsData[2][10] = approved;
    wsData[3][9] = "ยอดที่ไม่อนุมัติ";    wsData[3][10] = denied;
    wsData[4][9] = "ยอดรอตรวจสอบ";   wsData[4][10] = pending;

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // กำหนดความกว้างคอลัมน์ให้ดูสวยงาม
    ws['!cols'] = [{wch: 5}, {wch: 30}, {wch: 20}, {wch: 10}, {wch: 15}, {wch: 10}, {wch: 15}, {wch: 30}, {wch: 5}, {wch: 20}, {wch: 15}];

    XLSX.utils.book_append_sheet(wb, ws, "Budget Plan");
    XLSX.writeFile(wb, `งบประมาณ_${req.topic_name}.xlsx`);
}

window.triggerImportExcel = function(reqId) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls';
    fileInput.onchange = (e) => handleExcelImport(e, reqId);
    fileInput.click();
}

window.handleExcelImport = function(event, reqId) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // อ่านข้อมูลเป็น Array ของ Array (เพื่อให้ตรงคอลัมน์ A=0, B=1, ...)
            const rows = XLSX.utils.sheet_to_json(worksheet, {header: 1});
            const payloads = [];

            // เริ่มอ่านที่แถว 2 (Index 1) เพื่อข้าม Header
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const itemName = row[1]; // Column B (Index 1)
                if (!itemName) continue; // ถ้าชื่อรายการว่าง ให้ข้าม

                const priority = parseInt(row[2]) || 3;   // Column C
                const qty = parseFloat(row[3]) || 0;      // Column D
                const price = parseFloat(row[4]) || 0;    // Column E
                const discount = parseFloat(row[5]) || 0; // Column F
                const remark = row[7] || '';              // Column H

                // คำนวณราคาสุทธิเอง เพื่อความชัวร์ (ไม่พึ่งช่อง G)
                const netPrice = (qty * price) - discount;
                const finalNet = netPrice > 0 ? netPrice : 0;

                if (qty > 0 && price >= 0) {
                    payloads.push({
                        request_id: reqId,
                        item_name: itemName.toString().trim(),
                        priority_level: priority > 5 ? 5 : (priority < 1 ? 1 : priority),
                        quantity: qty,
                        unit_price: price,
                        discount: discount,
                        total_price: finalNet,
                        remark: remark.toString().trim(),
                        item_status: 'pending'
                    });
                }
            }

            if (payloads.length === 0) {
                return Swal.fire('ไม่พบข้อมูล', 'ไม่พบรายการที่ถูกต้องในไฟล์ Excel (โปรดเช็คคอลัมน์ B-E)', 'warning');
            }

            const confirm = await Swal.fire({
                title: 'ยืนยันการนำเข้าข้อมูล',
                html: `พบข้อมูลทั้งหมด <b>${payloads.length}</b> รายการ<br><span class="text-xs text-red-500">*ระบบจะเพิ่มต่อท้ายรายการเดิมที่มีอยู่แล้ว</span>`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                confirmButtonText: 'นำเข้าข้อมูล',
                cancelButtonText: 'ยกเลิก'
            });

            if (confirm.isConfirmed) {
                Swal.fire({title: 'กำลังนำเข้า...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
                const { error } = await supabaseClient.from('budget_items').insert(payloads);
                if (error) throw error;

                await Swal.fire('สำเร็จ', 'นำเข้าข้อมูลเรียบร้อยแล้ว', 'success');
                fetchBudgetRequests();
            }

        } catch (err) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ได้: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    
    // เคลียร์ค่า input เผื่อกดอัปโหลดไฟล์เดิมซ้ำ
    event.target.value = '';
}