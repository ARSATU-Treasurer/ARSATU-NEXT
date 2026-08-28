// js/other-income.js
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
    }
    
    // โหลดรายชื่อโครงการทั้งหมดมาใส่ Dropdown
    await loadCamps();
    fetchMyOtherHistory();
    
    if (editId) loadEditData(editId);
    
    document.getElementById('form-other').addEventListener('submit', handleOtherSubmit);
});

// ฟังก์ชันดึงข้อมูลโครงการมาสร้างตัวเลือก
async function loadCamps() {
    const selectEl = document.getElementById('other-context');
    try {
        const { data: camps } = await supabaseClient.from('camps').select('id, name, is_active').order('created_at', { ascending: false });
        if (camps) {
            selectEl.innerHTML = '<option value="ffffffff-ffff-ffff-ffff-ffffffffffff">ส่วนกลาง (ไม่ผูกโครงการ)</option>';
            camps.forEach(camp => {
                const option = document.createElement('option');
                option.value = camp.id;
                option.innerText = camp.name + (camp.is_active ? ' (โครงการปัจจุบัน)' : '');
                
                // ให้เลือกโครงการปัจจุบันเป็นค่าเริ่มต้น (ถ้าไม่ได้อยู่ในโหมด Edit)
                if (camp.is_active && !editId) option.selected = true;
                
                selectEl.appendChild(option);
            });
        }
    } catch (err) {
        console.error("Load camps error:", err);
    }
}

async function loadEditData(id) {
    try {
        const { data: item, error } = await supabaseClient.from('clearances').select('*').eq('id', id).single();
        if (error) throw error;
        
        if (item) {
            document.getElementById('other-type').value = item.request_type;
            
            // ตั้งค่า Dropdown ให้ตรงกับ camp_id ของข้อมูลเก่า
            document.getElementById('other-context').value = item.camp_id;
            
            let details = item.purpose;
            if (details.includes(': ')) {
                details = details.substring(details.indexOf(': ') + 2);
            }
            document.getElementById('other-details').value = details;
            document.getElementById('other-date').value = item.created_at.split('T')[0];
            document.getElementById('other-amount').value = item.total_amount;
            document.getElementById('other-remark').value = item.remark || '';
            
            document.getElementById('other-slip').removeAttribute('required');
            
            const btn = document.querySelector('#form-other button[type="submit"]');
            btn.innerHTML = '<i data-lucide="edit-3" class="w-5 h-5 inline mb-0.5"></i> บันทึกการแก้ไข';
            lucide.createIcons();
        }
    } catch (err) {
        console.error("Load Edit Data Error:", err);
    }
}

async function handleOtherSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('other-type').value;
    const amount = parseFloat(document.getElementById('other-amount').value);
    const details = document.getElementById('other-details').value;
    const date = document.getElementById('other-date').value;
    
    // ดึงค่า camp_id ตรงๆ จาก Dropdown ที่ผู้ใช้เลือก
    const finalCampId = document.getElementById('other-context').value;

    const typeLabel = type === 'other_income' ? 'รายรับอื่นๆ (Income)' : 'รายจ่ายอื่นๆ (Expense)';
    const typeColor = type === 'other_income' ? 'text-teal-600' : 'text-rose-600';
    const bgAmount = type === 'other_income' ? 'bg-teal-50 border-teal-200' : 'bg-rose-50 border-rose-200';

    // ... (ส่วนโค้ด Swal.fire และการอัปโหลดไฟล์/บันทึกฐานข้อมูลด้านล่างให้ใช้ของเดิมได้เลยครับ โดยเปลี่ยน payload.camp_id เป็น finalCampId ซึ่งผมแนบมาให้แล้วด้านล่าง) ...

    // Pop-up ยืนยัน
    const confirmResult = await Swal.fire({
        title: 'ยืนยันการทำรายการ',
        icon: 'info',
        html: `
            <div class="text-left text-sm mt-3 border-t border-gray-100 pt-4 space-y-2">
                <p class="text-gray-500">ประเภท: <span class="font-bold ${typeColor}">${typeLabel}</span></p>
                <p class="text-gray-500">รายละเอียด: <span class="font-bold text-gray-800">${details}</span></p>
                <div class="${bgAmount} p-4 rounded-xl border mt-3 text-center">
                    <p class="${typeColor} font-bold text-xs mb-1">ยอดเงิน</p>
                    <p class="text-3xl font-extrabold ${typeColor}">${amount.toLocaleString('th-TH', {minimumFractionDigits: 2})} ฿</p>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: type === 'other_income' ? '#0d9488' : '#e11d48',
        cancelButtonColor: '#9ca3af',
        confirmButtonText: 'ยืนยันข้อมูล',
        cancelButtonText: 'ยกเลิก',
        reverseButtons: true
    });

    if (!confirmResult.isConfirmed) return;

    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin inline"></i> กำลังบันทึก...';
    lucide.createIcons();

    try {
        const file = document.getElementById('other-slip').files[0];
        let receiptUrlArray = null;

        // อัปโหลดไฟล์ใหม่ (ถ้ามีการเลือกไฟล์)
        if (file) {
            const ext = file.name.split('.').pop();
            const filePath = `reports/others_${Date.now()}.${ext}`;
            await supabaseClient.storage.from('receipts').upload(filePath, file);
            const { data: urlData } = supabaseClient.storage.from('receipts').getPublicUrl(filePath);
            receiptUrlArray = [urlData.publicUrl];
        }

        const contextValue = document.getElementById('other-context').value;
        const finalCampId = contextValue === 'current' ? currentCampId : contextValue;

        const payload = {
            user_id: currentUser.id,
            camp_id: finalCampId, // 🌟 ใช้ finalCampId แทน currentCampId
            status: 'pending',
            request_type: type,
            total_amount: amount,
            purpose: `${type === 'other_income' ? 'รายรับอื่นๆ' : 'รายจ่ายอื่นๆ'}: ${details}`,
            remark: document.getElementById('other-remark').value,
            created_at: new Date(date).toISOString(),
            department: 'ส่วนกลาง',
            reject_reason: null // เคลียร์หมายเหตุการตีกลับเมื่อส่งบิลใหม่
        };

        if (receiptUrlArray) {
            payload.receipt_image_url = JSON.stringify(receiptUrlArray);
        }

        if (editId) {
            // อัปเดตรายการเดิม
            const { error } = await supabaseClient.from('clearances').update(payload).eq('id', editId);
            if (error) throw error;
            await Swal.fire('สำเร็จ', 'บันทึกการแก้ไขและส่งรายการใหม่เรียบร้อย', 'success');
            window.location.href = 'history.html';
        } else {
            // สร้างรายการใหม่
            const { error } = await supabaseClient.from('clearances').insert([payload]);
            if (error) throw error;
            await Swal.fire('สำเร็จ', 'ส่งรายการเรียบร้อย', 'success');
            e.target.reset(); 
            document.getElementById('other-date').value = new Date().toISOString().split('T')[0];
            fetchMyOtherHistory();
        }
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
    finally { 
        btn.disabled = false; 
        btn.innerHTML = editId ? 'บันทึกการแก้ไขและส่งใหม่' : 'ส่งรายการบัญชี'; 
    }
}

async function fetchMyOtherHistory() {
    const container = document.getElementById('my-other-history');
    const { data: items } = await supabaseClient.from('clearances').select('*').eq('user_id', currentUser.id).in('request_type', ['other_income', 'other_expense']).order('created_at', { ascending: false });

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4 text-xs">ยังไม่มีประวัติรายการ</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        const isInc = item.request_type === 'other_income';
        
        // 🌟 แก้บั๊ก: จัดการการแสดงผลป้ายสถานะให้ครอบคลุม "ถูกตีกลับ"
        let statusBadge = '';
        if (item.status === 'cleared') statusBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">สำเร็จ</span>';
        else if (item.status === 'rejected') statusBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">ถูกตีกลับ</span>';
        else statusBadge = '<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">รอตรวจสอบ</span>';

        return `
            <div class="bg-white p-4 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                <div>
                    <p class="text-xs font-bold text-gray-800">${item.purpose}</p>
                    <p class="text-[10px] text-gray-400">${new Date(item.created_at).toLocaleDateString('th-TH')}</p>
                </div>
                <div class="text-right">
                    <p class="text-sm font-bold ${isInc ? 'text-teal-600':'text-red-500'} mb-1">${isInc ? '+':'-'}${parseFloat(item.total_amount).toLocaleString()} ฿</p>
                    ${statusBadge}
                </div>
            </div>`;
    }).join('');
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