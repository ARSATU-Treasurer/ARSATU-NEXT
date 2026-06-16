// js/settings.js

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    const userId = session.user.id;

    try {
        await liff.init({ liffId: "2009420030-ynRyKacD" }); 
        if (liff.isLoggedIn()) {
            const liffProfile = await liff.getProfile();
            if (liffProfile.pictureUrl) {
                document.getElementById('profile-pic-container').innerHTML = `<img src="${liffProfile.pictureUrl}" alt="Profile" class="w-full h-full object-cover">`;
            }
        }
    } catch (err) { console.error("LIFF Error:", err); }

    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (profile) {
        if(profile.full_name && profile.full_name !== 'ผู้ใช้งาน') document.getElementById('full-name').value = profile.full_name;
        if(profile.default_department) document.getElementById('department').value = profile.default_department;
        document.getElementById('bank-name').value = profile.bank_name || '';
        document.getElementById('bank-account').value = profile.bank_account || '';
        document.getElementById('bank-account-name').value = profile.bank_account_name || '';
    }

    document.getElementById('settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updateData = {
            full_name: document.getElementById('full-name').value,
            default_department: document.getElementById('department').value,
            bank_name: document.getElementById('bank-name').value,
            bank_account: document.getElementById('bank-account').value,
            bank_account_name: document.getElementById('bank-account-name').value
        };

        // 🌟 เพิ่ม Pop-up ยืนยันก่อนบันทึกโปรไฟล์
        const confirmResult = await Swal.fire({
            title: 'ยืนยันการบันทึกข้อมูล?',
            icon: 'info',
            html: `
                <div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2">
                    <p class="text-gray-500">ชื่อ: <span class="font-bold text-gray-800">${updateData.full_name}</span></p>
                    <p class="text-gray-500">ฝ่าย: <span class="font-bold text-gray-800">${updateData.default_department}</span></p>
                    
                    <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 mt-4 shadow-sm">
                        <p class="text-blue-800 font-bold text-xs mb-1"><i data-lucide="landmark" class="w-3.5 h-3.5 inline"></i> บัญชีรับเงินเริ่มต้น:</p>
                        ${updateData.bank_account ? `
                            <p class="text-blue-700 font-medium text-xs">${updateData.bank_name} (${updateData.bank_account})</p>
                            <p class="text-blue-700 font-medium text-xs">${updateData.bank_account_name || 'ไม่ระบุชื่อบัญชี'}</p>
                        ` : `<p class="text-red-500 font-bold text-xs">ยังไม่ระบุบัญชี (อาจต้องกรอกเองตอนส่งเบิก)</p>`}
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#9ca3af',
            confirmButtonText: 'บันทึกข้อมูล',
            cancelButtonText: 'กลับไปแก้ไข',
            reverseButtons: true,
            didOpen: () => { lucide.createIcons(); }
        });

        if (!confirmResult.isConfirmed) return;

        const btn = document.getElementById('btn-save');
        btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> กำลังบันทึก...';
        lucide.createIcons();

        const { error } = await supabaseClient.from('profiles').update(updateData).eq('id', userId);

        if (error) {
            Swal.fire('ข้อผิดพลาด', error.message, 'error');
            btn.disabled = false; btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> บันทึกข้อมูล';
            lucide.createIcons();
        } else {
            await Swal.fire('สำเร็จ!', 'บันทึกข้อมูลโปรไฟล์สำเร็จ!', 'success');
            window.location.href = 'dashboard.html';
        }
    });
});

// ฟังก์ชันเปิดปิดเมนู
function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

// เช็คสิทธิ์ Admin
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; 
    
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (profile && profile.role === 'admin') {
        const adminLink = document.getElementById('admin-action-link');
        if (adminLink) adminLink.classList.remove('hidden');
    }
});