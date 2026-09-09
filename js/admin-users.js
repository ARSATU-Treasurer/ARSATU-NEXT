// js/admin-users.js

let allUsers = [];
let filteredUsers = [];
let currentAdminId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. ตรวจสอบสิทธิ์ (ต้องเป็น Admin เท่านั้น)
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    
    currentAdminId = session.user.id;
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', currentAdminId).single();
    if (!profile || profile.role !== 'admin') return window.location.href = '../member/dashboard.html';

    // 2. โหลดข้อมูล
    await fetchUsers();

    // 3. ผูก Event Listener ให้ช่องค้นหาและตัวกรอง
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('role-filter').addEventListener('change', applyFilters);
    document.getElementById('dept-filter').addEventListener('change', applyFilters);
    document.getElementById('edit-user-form').addEventListener('submit', handleUpdateUser);
});

async function fetchUsers() {
    const container = document.getElementById('users-container');
    container.innerHTML = '<div class="text-center py-10 text-gray-400"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>กำลังโหลด...</div>';
    lucide.createIcons();

    try {
        const { data: profiles, error } = await supabaseClient.from('profiles').select('*').order('full_name', { ascending: true });
        if (error) throw error;
        
        allUsers = profiles || [];
        applyFilters();
    } catch (err) {
        container.innerHTML = `<div class="text-center py-10 text-red-500 text-sm">เกิดข้อผิดพลาด: ${err.message}</div>`;
    }
}

function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const roleFilter = document.getElementById('role-filter').value;
    const deptFilter = document.getElementById('dept-filter').value;

    filteredUsers = allUsers.filter(user => {
        const nameMatch = (user.full_name || '').toLowerCase().includes(searchTerm);
        const roleMatch = roleFilter === 'all' || user.role === roleFilter;
        const deptMatch = deptFilter === 'all' || user.default_department === deptFilter;
        return nameMatch && roleMatch && deptMatch;
    });

    renderUsers();
}

function renderUsers() {
    const container = document.getElementById('users-container');
    container.innerHTML = '';

    // อัปเดตสถิติ
    const adminCount = allUsers.filter(u => u.role === 'admin').length;
    document.getElementById('stat-admins').innerText = adminCount;
    document.getElementById('stat-total').innerText = allUsers.length;

    if (filteredUsers.length === 0) {
        container.innerHTML = `<div class="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">ไม่พบข้อมูลผู้ใช้งาน</div>`;
        return;
    }

    filteredUsers.forEach(user => {
        const isAdmin = user.role === 'admin';
        const roleBadge = isAdmin 
            ? `<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 flex items-center gap-1"><i data-lucide="shield-check" class="w-3 h-3"></i> แอดมิน</span>`
            : `<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold border border-gray-200 flex items-center gap-1"><i data-lucide="user" class="w-3 h-3"></i> สมาชิก</span>`;
        
        const isMe = user.id === currentAdminId;
        const meBadge = isMe ? `<span class="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">ฉันเอง</span>` : '';

        const card = `
            <div class="bg-white p-4 rounded-2xl border ${isAdmin ? 'border-emerald-100 shadow-emerald-50' : 'border-gray-100'} shadow-sm flex items-center justify-between group transition-all hover:shadow-md">
                <div class="flex-1 pr-3 overflow-hidden">
                    <div class="flex items-center gap-2 mb-1.5">
                        ${roleBadge}
                        <span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 rounded truncate">${user.default_department || 'ไม่ได้ระบุฝ่าย'}</span>
                        ${meBadge}
                    </div>
                    <h3 class="font-bold text-gray-800 text-sm truncate">${user.full_name || 'ไม่ระบุชื่อ'}</h3>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <button onclick="openEditModal('${user.id}')" class="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100" title="แก้ไขข้อมูล">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    ${!isMe ? `
                    <button onclick="deleteProfile('${user.id}', '${user.full_name}')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100" title="ลบผู้ใช้">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                    ` : `<div class="w-8"></div>`}
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', card);
    });

    lucide.createIcons();
}

// ================= ระบบแก้ไขผู้ใช้งาน ================= //

window.openEditModal = function(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-full-name').value = user.full_name || '';
    
    const deptSelect = document.getElementById('edit-department');
    if (user.default_department) {
        // ตรวจสอบว่ามี option นี้ไหม ถ้าไม่มีให้เลือก 'ส่วนกลาง'
        const exists = Array.from(deptSelect.options).some(opt => opt.value === user.default_department);
        deptSelect.value = exists ? user.default_department : 'ส่วนกลาง';
    } else {
        deptSelect.value = 'ส่วนกลาง';
    }

    document.getElementById('edit-role').value = user.role || 'member';
    
    // ถ้าแก้ไขตัวเอง ห้ามเปลี่ยน Role ตัวเองเป็น member (ป้องกันการไม่มีแอดมินเหลือในระบบ)
    const roleSelect = document.getElementById('edit-role');
    if (user.id === currentAdminId) {
        roleSelect.disabled = true;
        roleSelect.title = "คุณไม่สามารถลดสิทธิ์ตัวเองได้";
    } else {
        roleSelect.disabled = false;
        roleSelect.title = "";
    }

    document.getElementById('edit-user-modal').classList.remove('hidden');
};

window.closeEditModal = function() {
    document.getElementById('edit-user-modal').classList.add('hidden');
};

async function handleUpdateUser(e) {
    e.preventDefault();
    const userId = document.getElementById('edit-user-id').value;
    const fullName = document.getElementById('edit-full-name').value.trim();
    const department = document.getElementById('edit-department').value;
    let role = document.getElementById('edit-role').value;
    
    // ดักไว้เผื่อกรณีแก้ตัวเอง
    if (userId === currentAdminId) role = 'admin';

    // 🌟 ดึงข้อมูลผู้ใช้เดิมมาตรวจสอบว่ามีการเปลี่ยน Role หรือไม่
    const originalUser = allUsers.find(u => u.id === userId);
    
    // 🌟 ถ้าระดับสิทธิ์ (Role) ถูกเปลี่ยน ให้เด้งถามรหัสผ่านก่อน
    if (originalUser && originalUser.role !== role) {
        const { value: pin } = await Swal.fire({
            title: '🔒 ยืนยันสิทธิ์ผู้ดูแลระบบ',
            text: 'การเปลี่ยนสิทธิ์การใช้งาน (Role) จำเป็นต้องยืนยันตัวตน',
            input: 'password',
            inputLabel: 'กรุณากรอกรหัสผ่าน (PIN)',
            inputPlaceholder: 'รหัสผ่าน...',
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#059669'
        });

        // ตรวจสอบรหัส (ใช้รหัสเดียวกับตอนแก้สมุดบัญชี)
        if (pin !== 'Treasure@2025') {
            if (pin) Swal.fire('ปฏิเสธการเข้าถึง', 'รหัสผ่านไม่ถูกต้อง', 'error');
            return; // หยุดการทำงาน บันทึกไม่สำเร็จ
        }
    }

    const btn = document.getElementById('btn-save-user');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 inline animate-spin mr-1"></i>กำลังบันทึก...';
    lucide.createIcons();

    try {
        const { error } = await supabaseClient.from('profiles').update({
            full_name: fullName,
            default_department: department,
            role: role
        }).eq('id', userId);

        if (error) throw error;

        Swal.fire({
            title: 'สำเร็จ',
            text: 'อัปเดตข้อมูลผู้ใช้เรียบร้อยแล้ว',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false
        });

        closeEditModal();
        await fetchUsers(); // โหลดใหม่
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'บันทึกข้อมูล';
    }
}

// ================= ระบบลบผู้ใช้งาน ================= //

window.deleteProfile = async function(userId, userName) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบผู้ใช้?',
        html: `คุณกำลังจะลบโปรไฟล์ของ <b class="text-red-600">${userName || 'ไม่ระบุชื่อ'}</b> ออกจากระบบ<br><br>
               <span class="text-xs text-red-500">* ข้อมูลบิลต่างๆ ที่ผู้ใช้นี้เคยสร้างจะยังคงอยู่ในระบบ แต่รายชื่อจะไม่ปรากฏในนี้อีกต่อไป</span>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        
        try {
            // ลบแค่โปรไฟล์ ข้อมูล Auth จะไม่ถูกลบ (เนื่องจากความปลอดภัยของ Supabase มักไม่ยอมให้ Client ลบ Auth User โดยตรง)
            const { error } = await supabaseClient.from('profiles').delete().eq('id', userId);
            
            if (error) throw error;
            
            await Swal.fire('สำเร็จ!', 'ลบผู้ใช้งานเรียบร้อยแล้ว', 'success');
            fetchUsers();
        } catch (err) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถลบได้: ' + err.message, 'error');
        }
    }
};