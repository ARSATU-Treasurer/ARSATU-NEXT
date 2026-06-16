// js/dashboard.js ได้เลย
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';

    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', session.user.id).single();
    let isProfileComplete = true;

    if (profile) {
        document.getElementById('user-name').innerText = profile.full_name || 'ผู้ใช้งาน';
        if (profile.default_department) {
            const deptEl = document.getElementById('user-dept');
            deptEl.innerText = profile.default_department;
            deptEl.classList.remove('hidden');
        } else { isProfileComplete = false; }

        if (!profile.full_name || profile.full_name === 'ผู้ใช้งาน') isProfileComplete = false;

        if (profile.role === 'admin') {
            const adminBtn = document.getElementById('admin-menu-btn');
            if (adminBtn) adminBtn.classList.remove('hidden');

            // 🌟 แก้ตัวนับงานแอดมิน: รวมทุกอย่างที่แอดมินต้องตรวจ (เบิกเงิน + เงินเข้าค้างตรวจ)
            const { count } = await supabaseClient.from('clearances').select('*', { count: 'exact', head: true }).in('status', ['pending', 'pending_clearance']); 
            if (count > 0) {
                const badge = document.getElementById('admin-badge');
                if (badge) { badge.innerText = count; badge.classList.remove('hidden'); }
            }
        }

        if (!isProfileComplete) {
            document.getElementById('profile-warning').classList.remove('hidden');
            const clearanceLinks = document.querySelectorAll('a[href="clearances.html"]');
            clearanceLinks.forEach(link => {
                link.href = "#";
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    Swal.fire("โปรไฟล์ไม่สมบูรณ์", "กรุณาตั้งค่า 'ชื่อ' และ 'ฝ่าย' ในหน้าโปรไฟล์ให้ครบถ้วน", "warning").then(() => {
                        window.location.href = 'settings.html';
                    });
                });
            });
        }
    }

    // รูปโปรไฟล์ LINE
    try {
        await liff.init({ liffId: "2009420030-ynRyKacD" });
        if (liff.isLoggedIn()) {
            const liffProfile = await liff.getProfile();
            if (liffProfile.pictureUrl) {
                document.getElementById('user-avatar-container').innerHTML = `<img src="${liffProfile.pictureUrl}" class="w-full h-full object-cover">`;
            }
        }
    } catch (err) { console.error(err); }

    // ยอดเงินรวมทุกบัญชีธนาคาร
    const { data: banks } = await supabaseClient.from('bank_accounts').select('balance');
    const totalBankBalance = banks ? banks.reduce((sum, b) => sum + parseFloat(b.balance), 0) : 0;
    document.getElementById('total-balance-display').innerText = totalBankBalance.toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' ฿';

    // ค่ายที่ Active อยู่ในปัจจุบัน
    const { data: activeCamp } = await supabaseClient.from('camps').select('id, name').eq('is_active', true).single();
    if (activeCamp) {
        document.getElementById('active-camp-display').innerText = activeCamp.name;
        // เรียกคำนวณยอดโมดูลบริจาคประจำค่ายนี้
        fetchDashboardDonationStats(activeCamp.id);
        loadMemberAnalytics(activeCamp.id);
    }

    // นับสถิติ 4 บล็อกเบิกเงินของยูสเซอร์
    try {
        // โหลด request_type มาด้วยเพื่อเช็คเงื่อนไข
        const { data: myClearances } = await supabaseClient.from('clearances').select('status, request_type').eq('user_id', session.user.id).in('request_type', ['advance', 'reimburse']);
        
        if (myClearances) {
            // 1. รอเบิก (รอแอดมินอนุมัติบิลตั้งต้น)
            document.getElementById('stat-pending').innerText = myClearances.filter(c => c.status === 'pending').length;
            
            // 2. รอเคลียร์ (แอดมินโอนแล้ว รอเราทำเรื่องส่งบิลเคลียร์ หรือ ถูกตีกลับให้แก้บิล)
            document.getElementById('stat-pending-clearance').innerText = myClearances.filter(c => (c.status === 'approved' && c.request_type === 'advance') || c.status === 'advance_transferred').length;
            
            // 3. รอคืนเงิน/รอตรวจ (เราส่งบิลเคลียร์ไปแล้ว รอแอดมินตรวจกระทบยอด)
            document.getElementById('stat-advance-transferred').innerText = myClearances.filter(c => c.status === 'pending_clearance').length;
            
            // 4. สำเร็จ (เคลียร์สมบูรณ์แล้ว)
            document.getElementById('stat-cleared').innerText = myClearances.filter(c => c.status === 'cleared' || (c.status === 'approved' && c.request_type === 'reimburse')).length;
        }
    } catch (err) { console.error(err); }

    // โค้ดเสริมท้ายสุดใน document.addEventListener('DOMContentLoaded', async () => { ... })
    
    // ตรวจสอบว่ากดปุ่มสลับประเภทใดมาจากหน้าแรกให้เปิดฟอร์มแท็บนั้นทันที
    const urlParams = new URLSearchParams(window.location.search);
    const targetTab = urlParams.get('tab');
    if (targetTab === 'other' && typeof showTab === 'function') {
        showTab('other');
    } else if (targetTab === 'donation' && typeof showTab === 'function') {
        showTab('donation');
    }

    fetchProjects();
});

// 🌟 ฟังก์ชันคำนวณโมดูลสรุปยอดบริจาคของหน้าแรกแบบไร้รอยต่อ
async function fetchDashboardDonationStats(campId) {
    try {
        // ดึงรายการที่ได้รับอนุมัติ (cleared) และเป็นยอดบริจาคแท้จริง (income)
        const { data: donations } = await supabaseClient.from('clearances').select('total_amount, purpose').eq('camp_id', campId).eq('request_type', 'income').eq('status', 'cleared');
        const { data: goalData } = await supabaseClient.from('donation_goals').select('goal_amount').eq('camp_id', campId).single();

        let cash = 0, transfer = 0;
        if (donations) {
            donations.forEach(d => {
                const amt = parseFloat(d.total_amount);
                if (d.purpose.includes('เงินสด')) cash += amt;
                else transfer += amt;
            });
        }

        const grandTotal = cash + transfer;
        const goal = goalData ? parseFloat(goalData.goal_amount) : 0;
        const progressPercent = goal > 0 ? Math.min((grandTotal / goal) * 100, 100) : 0;

        // ดันข้อมูลลง UI หน้าแรก
        document.getElementById('dash-cash-total').innerText = cash.toLocaleString('th-TH') + ' ฿';
        document.getElementById('dash-transfer-total').innerText = transfer.toLocaleString('th-TH') + ' ฿';
        document.getElementById('dash-grand-total').innerText = grandTotal.toLocaleString('th-TH') + ' ฿';
        document.getElementById('dash-progress-bar').style.width = progressPercent + '%';
        document.getElementById('dash-progress-text').innerText = progressPercent.toFixed(0) + '%';
    } catch (err) { console.error("Donation Module Error:", err); }
}

async function fetchProjects() {
    try {
        const { data: camps } = await supabaseClient.from('camps').select('id, name, is_active').order('created_at', { ascending: false });
        const selectEl = document.getElementById('project-select');
        if (camps) {
            camps.forEach(camp => {
                const option = document.createElement('option');
                option.value = camp.id; option.innerText = camp.name + (camp.is_active ? ' (กำลังดำเนินการ)' : '');
                if (camp.is_active) option.selected = true;
                selectEl.appendChild(option);
            });
        }
    } catch (err) { console.error(err); }
}

function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    overlay.classList.toggle('hidden');
}




// 1. ฟังก์ชันเปิดปิดเมนู (เอาไว้ล่างสุดของไฟล์ JS)
function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

// 2. เช็คว่าเป็นแอดมินหรือเปล่า (เอาไปแทรกไว้ในฟังก์ชันที่ดึง session/profile ตอนเปิดหน้าเว็บ)
// ตัวอย่างเช่น ใน document.addEventListener('DOMContentLoaded', ...)
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; // หรือ redirect ไปหน้าล็อกอิน
    
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    
    // 🌟 ถ้าเป็น Admin ให้ลบคลาส hidden ออกจากปุ่ม
    if (profile && profile.role === 'admin') {
        const adminLink = document.getElementById('admin-action-link');
        if (adminLink) {
            adminLink.classList.remove('hidden');
        }
    }
});

// 🌟 ฟังก์ชันกราฟสรุปภาพรวมการเงิน (สำหรับหน้า Member)
async function loadMemberAnalytics(campId) {
    try {
        const { data: clearances, error } = await supabaseClient
            .from('clearances')
            .select('request_type, actual_amount, total_amount, created_at')
            .eq('camp_id', campId)
            .eq('status', 'cleared');

        if (error) {
            console.error("Supabase Analytics Error:", error);
            return;
        }

        const safeClearances = clearances || [];
        let totalIncome = 0;
        let totalExpense = 0;
        let dailyExpensesMap = {};

        safeClearances.forEach(doc => {
            const amt = parseFloat(doc.actual_amount || doc.total_amount || 0);
            
            if (doc.request_type === 'income' || doc.request_type === 'other_income') {
                totalIncome += amt;
            } else {
                totalExpense += amt;
                
                const dateObj = new Date(doc.created_at);
                const isoDate = dateObj.toISOString().split('T')[0];
                
                if (!dailyExpensesMap[isoDate]) dailyExpensesMap[isoDate] = 0;
                dailyExpensesMap[isoDate] += amt;
            }
        });

        const budgetText = document.getElementById('member-budget-text');
        const budgetProgress = document.getElementById('member-budget-progress');
        
        if (budgetText && budgetProgress) {
            budgetText.innerText = `${totalExpense.toLocaleString('th-TH')} / ${totalIncome.toLocaleString('th-TH')} ฿`;
            const percent = totalIncome > 0 ? Math.min((totalExpense / totalIncome) * 100, 100) : 0;
            budgetProgress.style.width = `${percent}%`;
            
            if (percent >= 80) {
                budgetProgress.classList.replace('bg-blue-600', 'bg-red-500');
                budgetText.classList.replace('text-blue-600', 'text-red-600');
            }
        }

        const sortedDates = Object.keys(dailyExpensesMap).sort();
        let chartLabels = [];
        let chartData = [];

        sortedDates.forEach(dateStr => {
            const d = new Date(dateStr);
            chartLabels.push(d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
            chartData.push(dailyExpensesMap[dateStr]);
        });

        if (chartData.length === 0) {
            chartLabels = ['ยังไม่มีข้อมูล'];
            chartData = [0];
        }

        const ctx = document.getElementById('memberExpenseChart');
        if (ctx) {
            if (window.memberLineChart) window.memberLineChart.destroy();
            
            window.memberLineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'ยอดใช้จ่าย (บาท)',
                        data: chartData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { 
                            callbacks: { 
                                label: (ctx) => ` จ่ายไป ${ctx.raw.toLocaleString('th-TH')} ฿` 
                            } 
                        }
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            ticks: { callback: function(value) { return value.toLocaleString('th-TH'); } }
                        }
                    }
                }
            });
        }
    } catch (err) {
        console.error("Member Analytics Error:", err);
    }
}

// ================= ระบบบัญชีผู้ใช้ (Auth) ================= //

// 🌟 ฟังก์ชันออกจากระบบ (Logout)
window.logout = async function() {
    Swal.fire({
        title: 'ต้องการออกจากระบบ?',
        text: "คุณแน่ใจหรือไม่ที่จะออกจากระบบ ARSATU NEXT",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444', 
        cancelButtonColor: '#9ca3af', 
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ 
                title: 'กำลังออกจากระบบ...', 
                allowOutsideClick: false, 
                didOpen: () => { Swal.showLoading(); } 
            });
            
            try {
                // ล้าง Session ใน Supabase
                await supabaseClient.auth.signOut();
                // เด้งกลับไปหน้า Login หลัก
                window.location.href = '../index.html';
            } catch (err) {
                Swal.fire('ข้อผิดพลาด', 'ไม่สามารถออกจากระบบได้: ' + err.message, 'error');
            }
        }
    });
};