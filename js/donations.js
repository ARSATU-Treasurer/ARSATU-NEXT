// js/donations.js
let currentUser = null;
let currentCampId = null;
let editId = new URLSearchParams(window.location.search).get('id');

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

    if (editId) loadEditData(editId);

    document.getElementById('form-donation').addEventListener('submit', handleDonationSubmit);
});

async function loadEditData(id) {
    try {
        const { data: item, error } = await supabaseClient.from('clearances').select('*').eq('id', id).single();
        if (error) throw error;
        
        if (item) {
            document.getElementById('don-amount').value = item.total_amount;
            document.getElementById('don-date').value = item.created_at.split('T')[0];
            document.getElementById('don-remark').value = item.remark || '';
            
            // แยกประเภทช่องทางจาก purpose (เช่น "รับบริจาค (โอนเงิน): ค่าอาหาร")
            let purposeStr = item.purpose || '';
            let channel = 'เงินสด';
            if (purposeStr.includes('โอนเงิน')) {
                channel = 'โอนเงิน';
                document.querySelector('input[name="don-channel"][value="โอนเงิน"]').checked = true;
            } else {
                document.querySelector('input[name="don-channel"][value="เงินสด"]').checked = true;
            }
            
            // แยกรายละเอียด
            let details = purposeStr;
            if (purposeStr.includes(': ')) {
                details = purposeStr.substring(purposeStr.indexOf(': ') + 2);
            }
            document.getElementById('don-details').value = details;
            
            // ปลด required ออก เพราะอาจจะไม่ต้องการอัปโหลดสลิปใหม่
            document.getElementById('don-slip').removeAttribute('required');
            
            const btn = document.querySelector('#form-donation button[type="submit"]');
            btn.innerHTML = '<i data-lucide="edit-3" class="w-5 h-5 inline mb-0.5"></i> อัปเดตข้อมูล';
            lucide.createIcons();
        }
    } catch (err) {
        console.error("Load Edit Data Error:", err);
    }
}

async function fetchDonationStats() {
    try {
        const { data: trans } = await supabaseClient.from('clearances').select('total_amount').eq('camp_id', currentCampId).eq('request_type', 'income').eq('status', 'cleared');
        const { data: goalData } = await supabaseClient.from('donation_goals').select('goal_amount').eq('camp_id', currentCampId).maybeSingle();

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
        title: 'ยืนยันการบันทึกยอดบริจาค?',
        icon: 'question',
        html: `<div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2"><p class="text-gray-500">ช่องทาง : <span class="font-bold text-pink-600">${channel}</span></p><p class="text-gray-500">วันที่รับยอด : <span class="font-bold text-gray-800">${new Date(date).toLocaleDateString('th-TH')}</span></p><p class="text-gray-500">รายละเอียด : <span class="font-bold text-gray-800">${details}</span></p><div class="bg-pink-50 p-4 rounded-xl border border-pink-200 mt-3 text-center"><p class="text-pink-600 font-bold text-xs mb-1">ยอดเงินบริจาค</p><p class="text-3xl font-extrabold text-pink-700">${amount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p></div></div>`,
        showCancelButton: true, confirmButtonColor: '#ec4899', cancelButtonColor: '#9ca3af', confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก', reverseButtons: true
    });

    if (!confirmResult.isConfirmed) return;

    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> กำลังบันทึก...';
    lucide.createIcons();

    try {
        const file = document.getElementById('don-slip').files[0];
        let receiptUrlArray = null;

        if (file) {
            const ext = file.name.split('.').pop();
            const filePath = `donations/${Date.now()}.${ext}`;
            const { error: uploadError } = await supabaseClient.storage.from('receipts').upload(filePath, file);
            if (uploadError) throw uploadError;
            const { data: urlData } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
            receiptUrlArray = [urlData.publicUrl];
        }

        const payload = {
            user_id: currentUser.id,
            camp_id: currentCampId,
            status: 'pending',
            request_type: 'income',
            total_amount: amount,
            purpose: `รับบริจาค (${channel}): ${details}`,
            remark: document.getElementById('don-remark').value,
            created_at: new Date(date).toISOString(),
            department: 'ส่วนกลาง',
            reject_reason: null // รีเซ็ตเหตุผลการตีกลับ
        };

        if (receiptUrlArray) {
            payload.receipt_image_url = JSON.stringify(receiptUrlArray);
        }

        if (editId) {
            const { error } = await supabaseClient.from('clearances').update(payload).eq('id', editId);
            if (error) throw error;
            await Swal.fire('สำเร็จ', 'อัปเดตข้อมูลเรียบร้อยแล้ว', 'success');
            window.location.href = 'donations.html';
        } else {
            const { error } = await supabaseClient.from('clearances').insert([payload]);
            if (error) throw error;
            await Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success');
            e.target.reset(); 
            document.getElementById('don-date').value = new Date().toISOString().split('T')[0];
            fetchDonationStats(); 
            fetchMyDonations();
        }
    } catch (err) { Swal.fire('ข้อผิดพลาด', err.message, 'error'); }
    finally { 
        btn.disabled = false; 
        btn.innerHTML = editId ? '<i data-lucide="edit-3" class="w-5 h-5 inline mb-0.5"></i> อัปเดตข้อมูล' : 'บันทึกยอดบริจาค'; 
        lucide.createIcons();
    }
}

async function fetchMyDonations() {
    const container = document.getElementById('my-donations-history');
    const { data: items } = await supabaseClient.from('clearances').select('*').eq('user_id', currentUser.id).eq('request_type', 'income').order('created_at', { ascending: false });

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4 text-xs">ยังไม่มีประวัติการแจ้งยอด</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        let statusBadge = '';
        let amountColor = 'text-pink-600';
        let borderClass = 'border-gray-100';

        if (item.status === 'cleared') {
            statusBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">เสร็จสิ้น</span>';
        } else if (item.status === 'rejected') {
            statusBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">ตีกลับ</span>';
            amountColor = 'text-gray-400 line-through';
            borderClass = 'border-red-100 bg-red-50/50';
        } else {
            statusBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">รอตรวจสอบ</span>';
        }

        let reasonHtml = '';
        let editBtn = '';
        if (item.status === 'rejected' && item.reject_reason) {
            reasonHtml = `<p class="text-[10px] text-red-600 mt-1.5 bg-red-100/50 p-1.5 rounded inline-block"><i data-lucide="alert-circle" class="w-3 h-3 inline mb-0.5"></i> ${item.reject_reason}</p>`;
            editBtn = `<div class="mt-2"><a href="donations.html?id=${item.id}" class="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 px-2.5 py-1.5 rounded-lg font-bold hover:bg-blue-100 transition-colors inline-flex items-center gap-1 shadow-sm"><i data-lucide="edit-3" class="w-3 h-3"></i> แก้ไขรายการ</a></div>`;
        }

        return `
        <div class="bg-white p-4 rounded-xl border ${borderClass} flex justify-between items-start shadow-sm transition-all">
            <div class="flex-1 pr-3">
                <p class="text-xs font-bold text-gray-800">${item.purpose}</p>
                <p class="text-[10px] text-gray-400">${new Date(item.created_at).toLocaleDateString('th-TH')}</p>
                ${reasonHtml}
                ${editBtn}
            </div>
            <div class="text-right shrink-0 flex flex-col items-end gap-1.5">
                <p class="text-sm font-bold ${amountColor}">+${parseFloat(item.total_amount).toLocaleString()} ฿</p>
                ${statusBadge}
            </div>
        </div>
        `;
    }).join('');
    
    lucide.createIcons();
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