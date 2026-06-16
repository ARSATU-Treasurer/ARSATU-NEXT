// js/auth.js
const LIFF_ID = "2009420030-ynRyKacD";

async function initApp() {
    try {
        console.log("1. กำลังเริ่มต้น LIFF...");
        await liff.init({ liffId: LIFF_ID });
        console.log("2. LIFF เริ่มต้นสำเร็จ");

        const currentPath = window.location.pathname;
        const isLoginPage = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('ARSATU%20NEXT/');

        // 🌟 1. เช็ค Session ของ Supabase ก่อนเลย ป้องกัน Infinite Loop
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            console.log("-> มี Session Supabase อยู่แล้ว ไม่ต้องล็อกอินซ้ำ");
            if (isLoginPage) {
                // ถ้ามี Session และอยู่หน้า Login ให้พาไป Dashboard ทันที
                window.location.href = '/member/dashboard.html';
            }
            return; // หยุดการทำงานของ auth.js ตรงนี้
        }

        // 🌟 2. ถ้ายังไม่มี Session ให้เข้าสู่กระบวนการล็อกอิน LIFF
        if (liff.isLoggedIn()) {
            console.log("3. พบการล็อกอินใน LIFF");
            if (isLoginPage) {
                Swal.fire({
                    title: 'กำลังเข้าสู่ระบบ',
                    html: 'กำลังเชื่อมต่อฐานข้อมูลและตรวจสอบสิทธิ์...',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    allowEnterKey: false,
                    didOpen: () => { Swal.showLoading(); }
                });
            }

            const idToken = liff.getIDToken();
            await loginToSupabase(idToken, isLoginPage);
        } else {
            console.log("3. ยังไม่ได้ล็อกอิน LIFF เตรียมรอผู้ใช้กดปุ่ม");
            setupLoginButton();
        }
    } catch (error) {
        console.error("LIFF Init Error:", error);
        Swal.fire("การเชื่อมต่อ LINE มีปัญหา: " + error.message, '', 'error');
    }
}

function setupLoginButton() {
    const loginBtn = document.getElementById('login-line-btn');
    if (!loginBtn) return;

    const newBtn = loginBtn.cloneNode(true);
    loginBtn.parentNode.replaceChild(newBtn, loginBtn);

    newBtn.addEventListener('click', () => {
        console.log(">> กดปุ่มล็อกอินแล้ว");
        newBtn.disabled = true;
        newBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin mr-2"></i> กำลังเปิดหน้าล็อกอิน...';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        liff.login({ redirectUri: window.location.href });
    });
}

async function loginToSupabase(idToken, isLoginPage) {
    try {
        console.log("4. กำลังส่ง ID Token ให้ Supabase...");
        
        const { data, error } = await supabaseClient.auth.signInWithIdToken({
            provider: 'custom:line', 
            token: idToken
        });

        if (error) throw error;
        
        // ดักจับกรณี Auth สำเร็จแต่ไม่ได้ Session
        if (!data.session) throw new Error("ไม่พบ Session จากระบบ (เกิดข้อผิดพลาดในการยืนยันตัวตน)");

        console.log("5. Supabase ตอบกลับสำเร็จ");

        const profilePayload = liff.getDecodedIDToken();
        const fullName = profilePayload?.name || 'ผู้ใช้งาน';
        const lineUserId = profilePayload?.sub; 

        const { data: existingProfile } = await supabaseClient.from('profiles').select('id, line_user_id').eq('id', data.user.id).single();

        if (!existingProfile) {
            await supabaseClient.from('profiles').insert({
                id: data.user.id, full_name: fullName, role: 'member', line_user_id: lineUserId 
            });
        } else if (!existingProfile.line_user_id && lineUserId) {
            await supabaseClient.from('profiles').update({ line_user_id: lineUserId }).eq('id', data.user.id);
        }

        if (isLoginPage) {
            Swal.close();
            window.location.href = '/member/dashboard.html';
        }

    } catch (error) {
        console.error("Supabase Error:", error);
        if (isLoginPage) Swal.fire("Supabase ปฏิเสธการเข้าถึง: " + error.message, '', 'error');
        liff.logout();
    }
}

document.addEventListener('DOMContentLoaded', initApp);

// ==========================================
// 🛠️ Developer Backdoor 
// ==========================================
window.devLogin = async function() {
    const { value: pin } = await Swal.fire({
        title: '🔒 โหมดนักพัฒนา',
        input: 'password',
        inputLabel: 'กรุณายืนยันรหัสผ่านชั้นที่ 2 (Developer PIN)',
        inputPlaceholder: 'ป้อนรหัสผ่านของคุณ...',
        inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
        showCancelButton: true, confirmButtonColor: '#3b82f6', cancelButtonColor: '#9ca3af', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => { if (!value) return 'คุณต้องใส่รหัสผ่าน!'; }
    });

    if (pin !== 'Treasure@2025') { 
        if (pin) Swal.fire({ icon: 'error', title: 'รหัสไม่ถูกต้อง!', text: 'คุณไม่มีสิทธิ์เข้าถึงโหมดนี้', timer: 2000, showConfirmButton: false });
        return; 
    }

    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', html: 'กำลังเชื่อมต่อฐานข้อมูลจำลอง', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: 'dev@test.com', 
            password: '12345678'   
        });
        if (error) throw error;

        const userId = data.user.id;
        const { data: existingProfile } = await supabaseClient.from('profiles').select('id, role').eq('id', userId).single();

        if (!existingProfile) {
            await supabaseClient.from('profiles').insert({ id: userId, full_name: 'บัญชีทดสอบ (Dev)', role: 'admin' });
        } else if (existingProfile.role !== 'admin') {
            await supabaseClient.from('profiles').update({ role: 'admin' }).eq('id', userId);
        }

        Swal.close();
        window.location.href = '/admin/dashboard.html'; 
    } catch (error) {
        Swal.fire("เข้าสู่ระบบจำลองล้มเหลว", error.message, 'error');
    }
}