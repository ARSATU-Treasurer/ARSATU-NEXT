// js/donations.js
let currentUser = null;
let currentCampId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return window.location.href = '../index.html';
    currentUser = session.user;

    const { data: camp } = await supabaseClient.from('camps').select('id').eq('is_active', true).single();
    if (camp) {
        currentCampId = camp.id;
        fetchDonationStats();
        fetchMyDonations();
    }

    document.getElementById('form-donation').addEventListener('submit', handleDonationSubmit);
});

async function fetchDonationStats() {
    try {
        const { data: trans } = await supabaseClient.from('clearances').select('total_amount').eq('camp_id', currentCampId).eq('request_type', 'income').eq('status', 'cleared');
        const { data: goalData } = await supabaseClient.from('donation_goals').select('goal_amount').eq('camp_id', currentCampId).maybesingle();

        const total = trans ? trans.reduce((sum, t) => sum + parseFloat(t.total_amount), 0) : 0;
        const goal = goalData ? parseFloat(goalData.goal_amount) : 0;
        const percentage = goal > 0 ? Math.min((total / goal) * 100, 100) : 0;

        document.getElementById('total-donations').innerText = total.toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' ฿';
        document.getElementById('progress-bar').style.width = percentage + '%';
        document.getElementById('progress-text').innerText = `${percentage.toFixed(0)}% จากเป้าหมาย (${goal.toLocaleString()} ฿)`;
    } catch (err) { console.error(err); }
}

async function handleDonationSubmit(e) {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('don-amount').value);
    const details = document.getElementById('don-details').value;
    const channel = document.querySelector('input[name="don-channel"]:checked').value;
    const date = document.getElementById('don-date').value;
    
    const confirmResult = await Swal.fire({
        title: 'ยืนยันแจ้งยอดบริจาค?',
        icon: 'question',
        html: `<div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2"><p class="text-gray-500">ช่องทางรับเงิน: <span class="font-bold text-pink-600">${channel}</span></p><p class="text-gray-500">วันที่รับเงิน: <span class="font-bold text-gray-800">${new Date(date).toLocaleDateString('th-TH')}</span></p><p class="text-gray-500">รายละเอียด: <span class="font-bold text-gray-800">${details}</span></p><div class="bg-pink-50 p-4 rounded-xl border border-pink-200 mt-3 text-center"><p class="text-pink-600 font-bold text-xs mb-1">ยอดเงินที่ได้รับเข้าค่าย</p><p class="text-3xl font-extrabold text-pink-700">${amount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p></div></div>`,
        showCancelButton: true, confirmButtonColor: '#ec4899', cancelButtonColor: '#9ca3af', confirmButtonText: 'ยืนยันส่งข้อมูล', cancelButtonText: 'ยกเลิก', reverseButtons: true
    });

    if (!confirmResult.isConfirmed) return;

    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> กำลังส่งข้อมูล...';
    lucide.createIcons();

    try {
        const file = document.getElementById('donation-slip').files[0];
        const ext = file.name.split('.').pop();
        const filePath = `donations/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabaseClient.storage.from('receipts').upload(filePath, file);
        if (uploadError) throw uploadError;

        // ดึง URL กลับมาใส่ urlData
        const { data: urlData } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);

        const payload = {
            user_id: currentUser.id,
            camp_id: currentCampId,
            status: 'pending',
            request_type: 'income',
            total_amount: amount,
            purpose: `รับบริจาค (${channel}): ${details}`,
            remark: document.getElementById('don-remark').value,
            receipt_image_url: JSON.stringify([urlData.publicUrl]),
            created_at: new Date(date).toISOString(),
            department: 'ทั่วไป'
        };

        const { error } = await supabaseClient.from('clearances').insert([payload]);
        if (error) throw error;

        await Swal.fire('สำเร็จ', 'บันทึกยอดเงินบริจาคส่งให้เหรัญญิกตรวจเช็คแล้ว', 'success');
        e.target.reset(); document.getElementById('don-date').value = new Date().toISOString().split('T')[0];
        fetchDonationStats(); fetchMyDonations();
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
    finally { btn.disabled = false; btn.innerText = 'ส่งยอดเงินบริจาค'; }
}

async function fetchMyDonations() {
    const container = document.getElementById('my-donations-history');
    const { data: items } = await supabaseClient.from('clearances').select('*').eq('user_id', currentUser.id).eq('request_type', 'income').order('created_at', { ascending: false });

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4 text-xs">ยังไม่มีประวัติการส่งยอดเงินบริจาค</p>';
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
            <div>
                <p class="text-xs font-bold text-gray-800">${item.purpose}</p>
                <p class="text-[10px] text-gray-400">${new Date(item.created_at).toLocaleDateString('th-TH')}</p>
            </div>
            <div class="text-right">
                <p class="text-sm font-bold text-pink-600">+${parseFloat(item.total_amount).toLocaleString()} ฿</p>
                <span class="text-[9px] px-1.5 py-0.5 rounded-full ${item.status === 'cleared' ? 'bg-green-100 text-green-700':'bg-orange-100 text-orange-700'}">${item.status === 'cleared' ? 'อนุมัติแล้ว':'รอตรวจสอบ'}</span>
            </div>
        </div>
    `).join('');
}

function toggleActionMenu() {
    const overlay = document.getElementById('action-menu-overlay');
    if (overlay) overlay.classList.toggle('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return; 
    const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
    if (profile && profile.role === 'admin') {
        const adminLink = document.getElementById('admin-action-link');
        if (adminLink) adminLink.classList.remove('hidden');
    }
});