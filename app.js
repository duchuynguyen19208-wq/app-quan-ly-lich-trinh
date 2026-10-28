/**
 * DailyFlow - Smart Routine & Daily Schedule Management
 * Full-featured Application Logic
 */

(function () {
  'use strict';

  // =========================================================================
  // CONSTANTS & STATE
  // =========================================================================
  const STORAGE_KEY = 'dailyflow_tasks_v2';
  const SETTINGS_KEY = 'dailyflow_settings_v2';

  // Category Configuration
  const CATEGORIES = {
    work: { label: 'Công việc', icon: '💼', color: '#6366f1' },
    meeting: { label: 'Cuộc họp', icon: '🤝', color: '#ec4899' },
    study: { label: 'Học tập', icon: '📚', color: '#8b5cf6' },
    health: { label: 'Sức khỏe', icon: '🏃‍♂️', color: '#10b981' },
    personal: { label: 'Cá nhân', icon: '👤', color: '#06b6d4' },
    finance: { label: 'Tài chính', icon: '💰', color: '#f59e0b' },
    rest: { label: 'Nghỉ ngơi', icon: '☕', color: '#64748b' }
  };

  // Priority Definitions
  const PRIORITIES = {
    p1: { code: 'p1', label: 'Rất quan trọng', badgeClass: 'p1', icon: '🔥', desc: 'Khẩn cấp & Quan trọng' },
    p2: { code: 'p2', label: 'Quan trọng', badgeClass: 'p2', icon: '⭐', desc: 'Quan trọng - Không khẩn cấp' },
    p3: { code: 'p3', label: 'Bình thường', badgeClass: 'p3', icon: '⚡', desc: 'Khẩn cấp - Ít quan trọng' },
    p4: { code: 'p4', label: 'Không quan trọng', badgeClass: 'p4', icon: '☕', desc: 'Không quan trọng & Không khẩn cấp' }
  };

  // Reminder Labels
  const REMINDER_LABELS = {
    on_time: 'Đúng giờ',
    '5_min_before': 'Trước 5p',
    '10_min_before': 'Trước 10p',
    '15_min_before': 'Trước 15p',
    '30_min_before': 'Trước 30p',
    none: 'Không nhắc'
  };

  // App State
  let state = {
    tasks: [],
    selectedDate: getTodayDateString(),
    currentView: 'timeline', // 'timeline' | 'list' | 'matrix'
    activeFilter: 'all',     // 'all' | 'p1' | 'p2' | 'p3' | 'p4' | 'pending' | 'done'
    searchQuery: '',
    settings: {
      soundEnabled: true,
      notificationsEnabled: false,
      theme: 'dark'
    },
    activeAlarmTaskId: null
  };

  // =========================================================================
  // AUDIO SYNTHESIZER (Web Audio API - Zero External Dependencies)
  // =========================================================================
  const AudioService = {
    ctx: null,

    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    },

    playTone(frequency, duration, type = 'sine', startTime = 0, gainLevel = 0.15) {
      if (!state.settings.soundEnabled) return;
      try {
        this.init();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime + startTime);

        gain.gain.setValueAtTime(0, this.ctx.currentTime + startTime);
        gain.gain.linearRampToValueAtTime(gainLevel, this.ctx.currentTime + startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(this.ctx.currentTime + startTime);
        osc.stop(this.ctx.currentTime + startTime + duration + 0.05);
      } catch (err) {
        console.warn('Audio synthesis unavailable:', err);
      }
    },

    // Melodic chime for reminder alerts
    playReminderChime() {
      // Harmonic chord: C5 -> E5 -> G5 -> C6
      this.playTone(523.25, 0.4, 'sine', 0, 0.2);     // C5
      this.playTone(659.25, 0.4, 'sine', 0.12, 0.2);  // E5
      this.playTone(783.99, 0.45, 'sine', 0.24, 0.22); // G5
      this.playTone(1046.50, 0.7, 'sine', 0.36, 0.25); // C6
    },

    // Crisp high chime when task is completed
    playCompleteSound() {
      this.playTone(587.33, 0.2, 'triangle', 0, 0.15); // D5
      this.playTone(880.00, 0.35, 'triangle', 0.1, 0.18); // A5
    },

    // Soft click / snooze sound
    playSoftPing() {
      this.playTone(440.00, 0.15, 'sine', 0, 0.12);
    }
  };

  // =========================================================================
  // NOTIFICATION SERVICE
  // =========================================================================
  const NotificationService = {
    async requestPermission() {
      if (!('Notification' in window)) {
        showToast('Trình duyệt của bạn không hỗ trợ Web Notification', 'warning');
        return false;
      }

      if (Notification.permission === 'granted') {
        state.settings.notificationsEnabled = true;
        saveSettings();
        updateNotificationUI();
        showToast('Thông báo trình duyệt đã được bật sẵn sàng!', 'success');
        return true;
      }

      try {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          state.settings.notificationsEnabled = true;
          saveSettings();
          updateNotificationUI();
          showToast('Đã cấp quyền thông báo thành công! 🎉', 'success');
          // Send a test hello notification
          new Notification('DailyFlow: Đã bật thông báo', {
            body: 'Bạn sẽ nhận được nhắc nhở chính xác theo từng lịch trình!',
            icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="%236366f1"><circle cx="12" cy="12" r="10"/></svg>'
          });
          return true;
        } else {
          state.settings.notificationsEnabled = false;
          saveSettings();
          updateNotificationUI();
          showToast('Bạn đã từ chối quyền thông báo trên trình duyệt', 'warning');
          return false;
        }
      } catch (e) {
        console.error(e);
        return false;
      }
    },

    notifyTask(task) {
      // 1. Play sound chime
      AudioService.playReminderChime();

      // 2. Browser native notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted' && state.settings.notificationsEnabled) {
        const priorityText = PRIORITIES[task.priority]?.label || 'Lịch trình';
        const notifTitle = `⏰ Đến giờ: ${task.title}`;
        const notifBody = `[${priorityText}] ${task.startTime} - ${task.endTime}\n${task.notes || 'Hãy bắt đầu ngay!'}`;

        try {
          const notif = new Notification(notifTitle, {
            body: notifBody,
            tag: task.id,
            renotify: true
          });
          notif.onclick = () => {
            window.focus();
            openAlarmModal(task);
            notif.close();
          };
        } catch (e) {
          console.warn('Native notification failed:', e);
        }
      }

      // 3. Show In-App Alarm Popup Modal
      openAlarmModal(task);
      showToast(`🔔 Đến giờ: ${task.title} (${task.startTime})`, 'warning');
    }
  };

  // =========================================================================
  // SEED SAMPLE DATA (Realistic Daily Schedule)
  // =========================================================================
  function getSampleTasks() {
    const today = getTodayDateString();
    const tomorrow = getDateOffset(1);

    return [
      {
        id: 'seed_1',
        title: 'Tập thể dục buổi sáng & Chạy bộ khởi động',
        date: today,
        startTime: '06:30',
        endTime: '07:15',
        priority: 'p3',
        category: 'health',
        reminder: 'on_time',
        notes: 'Chạy 3km quanh công viên, hít thở không khí trong lành và giãn cơ.',
        completed: true,
        notified: true,
        createdAt: Date.now() - 36000000
      },
      {
        id: 'seed_2',
        title: 'Họp chiến lược ban giám đốc & Kế hoạch quý 4',
        date: today,
        startTime: '08:30',
        endTime: '10:00',
        priority: 'p1',
        category: 'meeting',
        reminder: '10_min_before',
        notes: 'Trình bày số liệu KPI, kế hoạch mở rộng thị trường và ngân sách dự kiến.',
        completed: true,
        notified: true,
        createdAt: Date.now() - 30000000
      },
      {
        id: 'seed_3',
        title: 'Hoàn thiện tài liệu đề xuất dự án mới cho khách hàng',
        date: today,
        startTime: '10:30',
        endTime: '12:00',
        priority: 'p1',
        category: 'work',
        reminder: '5_min_before',
        notes: 'Xem lại điều khoản hợp đồng, bảng báo giá chi tiết và timeline bàn giao.',
        completed: false,
        notified: false,
        createdAt: Date.now() - 25000000
      },
      {
        id: 'seed_4',
        title: 'Ăn trưa và nghỉ ngơi nạp năng lượng',
        date: today,
        startTime: '12:00',
        endTime: '13:15',
        priority: 'p4',
        category: 'rest',
        reminder: 'none',
        notes: 'Dùng bữa trưa thanh đạm, nghỉ trưa 20 phút tránh nhìn màn hình điện thoại.',
        completed: false,
        notified: false,
        createdAt: Date.now() - 20000000
      },
      {
        id: 'seed_5',
        title: 'Kiểm tra & Trả lời email định kỳ trong ngày',
        date: today,
        startTime: '13:30',
        endTime: '14:15',
        priority: 'p3',
        category: 'work',
        reminder: 'on_time',
        notes: 'Giải quyết các email chờ xử lý của đối tác, phân loại việc theo mức độ khẩn.',
        completed: false,
        notified: false,
        createdAt: Date.now() - 15000000
      },
      {
        id: 'seed_6',
        title: 'Review thiết kế & Thử nghiệm tính năng hệ thống',
        date: today,
        startTime: '14:30',
        endTime: '16:30',
        priority: 'p1',
        category: 'work',
        reminder: '15_min_before',
        notes: 'Kiểm tra giao diện mobile, test luồng thông báo thời gian thực và độ mượt UI.',
        completed: false,
        notified: false,
        createdAt: Date.now() - 10000000
      },
      {
        id: 'seed_7',
        title: 'Cập nhật kiến thức chuyên môn / Đọc tài liệu công nghệ',
        date: today,
        startTime: '16:45',
        endTime: '17:45',
        priority: 'p2',
        category: 'study',
        reminder: '5_min_before',
        notes: 'Nghiên cứu về kiến trúc AI Agent và tối ưu trải nghiệm người dùng hiện đại.',
        completed: false,
        notified: false,
        createdAt: Date.now() - 5000000
      },
      {
        id: 'seed_8',
        title: 'Bữa tối gia đình & Trò chuyện thư giãn',
        date: today,
        startTime: '18:30',
        endTime: '19:45',
        priority: 'p2',
        category: 'personal',
        reminder: 'on_time',
        notes: 'Dành trọn vẹn thời gian chất lượng cho người thân, không làm việc trong bữa ăn.',
        completed: false,
        notified: false,
        createdAt: Date.now() - 2000000
      },
      {
        id: 'seed_9',
        title: 'Lướt tin tức công nghệ & Nghe podcast giải trí',
        date: today,
        startTime: '20:30',
        endTime: '21:15',
        priority: 'p4',
        category: 'rest',
        reminder: 'none',
        notes: 'Nghe tập podcast mới về thói quen năng suất và sự tập trung sâu.',
        completed: false,
        notified: false,
        createdAt: Date.now() - 1000000
      },
      {
        id: 'seed_10',
        title: 'Tổng kết ngày hôm nay & Chuẩn bị lịch trình ngày mai',
        date: today,
        startTime: '21:30',
        endTime: '22:00',
        priority: 'p2',
        category: 'personal',
        reminder: 'on_time',
        notes: 'Đánh dấu các việc đã làm xong, xác định 3 việc quan trọng nhất ngày mai.',
        completed: false,
        notified: false,
        createdAt: Date.now()
      },
      // Tomorrow tasks
      {
        id: 'seed_11',
        title: 'Gặp gỡ đối tác ký kết thỏa thuận hợp tác',
        date: tomorrow,
        startTime: '09:00',
        endTime: '10:30',
        priority: 'p1',
        category: 'meeting',
        reminder: '15_min_before',
        notes: 'In sẵn 2 bản hợp đồng, chuẩn bị quà tặng lưu niệm của công ty.',
        completed: false,
        notified: false,
        createdAt: Date.now()
      },
      {
        id: 'seed_12',
        title: 'Học ngoại ngữ 45 phút trên ứng dụng',
        date: tomorrow,
        startTime: '19:30',
        endTime: '20:15',
        priority: 'p2',
        category: 'study',
        reminder: 'on_time',
        notes: 'Luyện tập phát âm và hoàn thành 2 bài kiểm tra từ vựng mới.',
        completed: false,
        notified: false,
        createdAt: Date.now()
      }
    ];
  }

  // =========================================================================
  // STORAGE & INITIALIZATION
  // =========================================================================
  function loadData() {
    try {
      const storedTasks = localStorage.getItem(STORAGE_KEY);
      if (storedTasks) {
        state.tasks = JSON.parse(storedTasks);
      } else {
        state.tasks = getSampleTasks();
        saveTasks();
      }

      const storedSettings = localStorage.getItem(SETTINGS_KEY);
      if (storedSettings) {
        state.settings = { ...state.settings, ...JSON.parse(storedSettings) };
      }
    } catch (e) {
      console.error('Failed to load data:', e);
      state.tasks = getSampleTasks();
    }
  }

  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
    } catch (e) {
      console.error('Failed to save tasks:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  // =========================================================================
  // DATE & TIME HELPERS
  // =========================================================================
  function getTodayDateString() {
    const now = new Date();
    return formatDateString(now);
  }

  function formatDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return formatDateString(d);
  }

  function formatDisplayDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = dayNames[date.getDay()];
    return `${dayName}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }

  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + (m || 0);
  }

  function minutesToTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function getCurrentMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  // =========================================================================
  // SCHEDULER & HEARTBEAT ENGINE (Notifications & Time Marker)
  // =========================================================================
  function startHeartbeatEngine() {
    // Run clock update every second
    updateClockAndGreeting();
    setInterval(updateClockAndGreeting, 1000);

    // Run reminder check every 5 seconds
    setInterval(checkReminders, 5000);

    // Update timeline marker position every 30 seconds
    setInterval(updateTimelineMarker, 30000);
  }

  function updateClockAndGreeting() {
    const now = new Date();
    const clockTimeEl = document.getElementById('clockTime');
    const clockDateEl = document.getElementById('clockDate');
    const greetingTextEl = document.getElementById('greetingText');

    if (clockTimeEl) {
      clockTimeEl.textContent = now.toLocaleTimeString('vi-VN', { hour12: false });
    }

    if (clockDateEl) {
      const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      const dayName = dayNames[now.getDay()];
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();
      clockDateEl.textContent = `${dayName}, ${d}/${m}/${y}`;
    }

    if (greetingTextEl) {
      const hour = now.getHours();
      let greeting = 'Chào bạn! Hãy khởi đầu ngày mới năng lượng';
      if (hour >= 5 && hour < 12) {
        greeting = 'Chào buổi sáng! Tập trung làm các việc quan trọng nhất ☀️';
      } else if (hour >= 12 && hour < 18) {
        greeting = 'Chào buổi chiều! Giữ vững tiến độ và nhịp điệu làm việc 🎯';
      } else if (hour >= 18 && hour < 22) {
        greeting = 'Buổi tối an lành! Rà soát công việc và thư giãn nhé 🌙';
      } else {
        greeting = 'Đã khuya rồi! Nghỉ ngơi sớm để tái tạo năng lượng 💤';
      }
      greetingTextEl.textContent = greeting;
    }
  }

  function checkReminders() {
    const todayStr = getTodayDateString();
    const currentMin = getCurrentMinutes();

    state.tasks.forEach(task => {
      // Only check tasks for today that are not completed and haven't notified yet
      if (task.date !== todayStr || task.completed || task.notified || task.reminder === 'none') {
        return;
      }

      const taskStartMin = timeToMinutes(task.startTime);
      let triggerMin = taskStartMin;

      switch (task.reminder) {
        case '5_min_before':
          triggerMin = taskStartMin - 5;
          break;
        case '10_min_before':
          triggerMin = taskStartMin - 10;
          break;
        case '15_min_before':
          triggerMin = taskStartMin - 15;
          break;
        case '30_min_before':
          triggerMin = taskStartMin - 30;
          break;
        case 'on_time':
        default:
          triggerMin = taskStartMin;
          break;
      }

      // Check if current minute matches trigger minute (within a 1-minute window)
      if (currentMin >= triggerMin && currentMin <= triggerMin + 1) {
        task.notified = true;
        saveTasks();
        NotificationService.notifyTask(task);
        renderCurrentView(); // Refresh UI to update status
      }
    });

    // Check currently active tasks to update Focus Banner
    updateFocusBanner();
  }

  // =========================================================================
  // UI RENDERING - HERO DASHBOARD & STATS
  // =========================================================================
  function updateDashboardStats() {
    const dayTasks = state.tasks.filter(t => t.date === state.selectedDate);
    const totalCount = dayTasks.length;
    const completedCount = dayTasks.filter(t => t.completed).length;
    const urgentCount = dayTasks.filter(t => t.priority === 'p1').length;
    const urgentPendingCount = dayTasks.filter(t => t.priority === 'p1' && !t.completed).length;
    const importantCount = dayTasks.filter(t => t.priority === 'p2').length;

    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Update Counter Elements
    const statTotalEl = document.getElementById('statTotal');
    const statUrgentEl = document.getElementById('statUrgent');
    const statUrgentPendingTagEl = document.getElementById('statUrgentPendingTag');
    const statImportantEl = document.getElementById('statImportant');
    const statCompletedEl = document.getElementById('statCompleted');

    if (statTotalEl) statTotalEl.textContent = totalCount;
    if (statUrgentEl) statUrgentEl.textContent = urgentCount;
    if (statUrgentPendingTagEl) {
      statUrgentPendingTagEl.textContent = `${urgentPendingCount} cần làm`;
      statUrgentPendingTagEl.style.display = urgentPendingCount > 0 ? 'inline-block' : 'none';
    }
    if (statImportantEl) statImportantEl.textContent = importantCount;
    if (statCompletedEl) statCompletedEl.textContent = completedCount;

    // Update Hero Progress Bar
    const heroProgressPercentEl = document.getElementById('heroProgressPercent');
    const heroCompletedCountEl = document.getElementById('heroCompletedCount');
    const heroTotalCountEl = document.getElementById('heroTotalCount');
    const heroProgressBarEl = document.getElementById('heroProgressBar');
    const heroTitleEl = document.getElementById('heroTitle');
    const heroSubtitleEl = document.getElementById('heroSubtitle');

    if (heroProgressPercentEl) heroProgressPercentEl.textContent = `${percent}%`;
    if (heroCompletedCountEl) heroCompletedCountEl.textContent = completedCount;
    if (heroTotalCountEl) heroTotalCountEl.textContent = totalCount;
    if (heroProgressBarEl) heroProgressBarEl.style.width = `${percent}%`;

    // Dynamic Title based on selected date
    const todayStr = getTodayDateString();
    if (heroTitleEl) {
      if (state.selectedDate === todayStr) {
        heroTitleEl.textContent = 'Tiến độ công việc hôm nay';
      } else if (state.selectedDate === getDateOffset(1)) {
        heroTitleEl.textContent = 'Kế hoạch công việc ngày mai';
      } else {
        heroTitleEl.textContent = `Lịch trình ngày ${formatDisplayDate(state.selectedDate)}`;
      }
    }

    if (heroSubtitleEl) {
      if (percent === 100 && totalCount > 0) {
        heroSubtitleEl.textContent = '🎉 Tuyệt vời! Bạn đã hoàn thành xuất sắc 100% lịch trình!';
      } else if (urgentPendingCount > 0) {
        heroSubtitleEl.textContent = `⚠️ Bạn có ${urgentPendingCount} việc RẤT QUAN TRỌNG cần ưu tiên xử lý trước!`;
      } else {
        heroSubtitleEl.textContent = 'Giữ vững nhịp điệu và quản lý thời gian thật khoa học!';
      }
    }

    // Update Filter Pill Counts
    updateFilterCounts(dayTasks);
  }

  function updateFilterCounts(dayTasks) {
    const countAll = dayTasks.length;
    const countP1 = dayTasks.filter(t => t.priority === 'p1').length;
    const countP2 = dayTasks.filter(t => t.priority === 'p2').length;
    const countP3 = dayTasks.filter(t => t.priority === 'p3').length;
    const countP4 = dayTasks.filter(t => t.priority === 'p4').length;

    const elAll = document.getElementById('countAll');
    const elP1 = document.getElementById('countP1');
    const elP2 = document.getElementById('countP2');
    const elP3 = document.getElementById('countP3');
    const elP4 = document.getElementById('countP4');

    if (elAll) elAll.textContent = countAll;
    if (elP1) elP1.textContent = countP1;
    if (elP2) elP2.textContent = countP2;
    if (elP3) elP3.textContent = countP3;
    if (elP4) elP4.textContent = countP4;
  }

  // =========================================================================
  // FOCUS BANNER (Highlight Current or Next Task)
  // =========================================================================
  function updateFocusBanner() {
    const banner = document.getElementById('focusBanner');
    if (!banner) return;

    const todayStr = getTodayDateString();
    if (state.selectedDate !== todayStr) {
      banner.style.display = 'none';
      return;
    }

    const currentMin = getCurrentMinutes();
    const todayTasks = state.tasks.filter(t => t.date === todayStr && !t.completed);

    if (todayTasks.length === 0) {
      banner.style.display = 'none';
      const label = document.getElementById('heroCurrentTaskLabel');
      if (label) label.textContent = 'Đã hoàn tất mọi việc!';
      return;
    }

    // Check if there is an active ongoing task right now
    let activeTask = todayTasks.find(t => {
      const s = timeToMinutes(t.startTime);
      const e = timeToMinutes(t.endTime);
      return currentMin >= s && currentMin <= e;
    });

    let isUpcoming = false;
    if (!activeTask) {
      // Find the nearest upcoming task
      const upcomingTasks = todayTasks
        .filter(t => timeToMinutes(t.startTime) > currentMin)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      
      if (upcomingTasks.length > 0) {
        activeTask = upcomingTasks[0];
        isUpcoming = true;
      }
    }

    if (activeTask) {
      banner.style.display = 'flex';
      const tagEl = document.getElementById('focusBannerTag');
      const titleEl = document.getElementById('focusBannerTitle');
      const timeEl = document.getElementById('focusBannerTime');
      const priorityEl = document.getElementById('focusBannerPriority');
      const heroLabel = document.getElementById('heroCurrentTaskLabel');

      const priorityInfo = PRIORITIES[activeTask.priority];

      if (tagEl) {
        tagEl.textContent = isUpcoming ? 'SẮP DIỄN RA TIẾP THEO' : '🔥 ĐANG DIỄN RA NGAY LÚC NÀY';
      }
      if (titleEl) titleEl.textContent = activeTask.title;
      if (timeEl) timeEl.textContent = `${activeTask.startTime} - ${activeTask.endTime}`;
      if (priorityEl) {
        priorityEl.textContent = `${priorityInfo.icon} ${priorityInfo.label}`;
        priorityEl.className = `badge-priority ${priorityInfo.badgeClass}`;
      }

      if (heroLabel) {
        heroLabel.textContent = isUpcoming
          ? `Việc kế tiếp: ${activeTask.title} (${activeTask.startTime})`
          : `Đang làm: ${activeTask.title}`;
      }

      // Quick done button handler
      const btnFocusDone = document.getElementById('btnFocusQuickDone');
      if (btnFocusDone) {
        btnFocusDone.onclick = () => toggleTaskCompleted(activeTask.id);
      }
    } else {
      banner.style.display = 'none';
      const label = document.getElementById('heroCurrentTaskLabel');
      if (label) label.textContent = 'Không có lịch trình tiếp theo';
    }
  }

  // =========================================================================
  // VIEW RENDERER DISPATCHER
  // =========================================================================
  function renderCurrentView() {
    updateDashboardStats();
    updateFocusBanner();

    // Filter tasks for the selected date and active filters
    let filteredTasks = state.tasks.filter(t => t.date === state.selectedDate);

    // Apply Filter
    if (state.activeFilter === 'p1') filteredTasks = filteredTasks.filter(t => t.priority === 'p1');
    else if (state.activeFilter === 'p2') filteredTasks = filteredTasks.filter(t => t.priority === 'p2');
    else if (state.activeFilter === 'p3') filteredTasks = filteredTasks.filter(t => t.priority === 'p3');
    else if (state.activeFilter === 'p4') filteredTasks = filteredTasks.filter(t => t.priority === 'p4');
    else if (state.activeFilter === 'pending') filteredTasks = filteredTasks.filter(t => !t.completed);
    else if (state.activeFilter === 'done') filteredTasks = filteredTasks.filter(t => t.completed);

    // Apply Search Query
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.trim().toLowerCase();
      filteredTasks = filteredTasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (CATEGORIES[t.category]?.label.toLowerCase().includes(q))
      );
    }

    // Sort by start time ascending
    filteredTasks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

    // Handle Empty State
    const emptyContainer = document.getElementById('emptyStateContainer');
    const timelineView = document.getElementById('timelineView');
    const listView = document.getElementById('listView');
    const matrixView = document.getElementById('matrixView');

    if (filteredTasks.length === 0) {
      if (emptyContainer) {
        emptyContainer.classList.remove('hidden');
        const emptyTitle = document.getElementById('emptyTitle');
        const emptyDesc = document.getElementById('emptyDesc');
        if (state.searchQuery) {
          emptyTitle.textContent = 'Không tìm thấy kết quả';
          emptyDesc.textContent = `Không có công việc nào khớp với từ khóa "${state.searchQuery}".`;
        } else if (state.activeFilter !== 'all') {
          emptyTitle.textContent = 'Không có công việc trong bộ lọc này';
          emptyDesc.textContent = 'Hãy chọn bộ lọc "Tất cả" hoặc thêm công việc mới vào danh mục này!';
        } else {
          emptyTitle.textContent = 'Lịch trình trống';
          emptyDesc.textContent = 'Bạn chưa lên lịch trình cho ngày này. Hãy bấm nút dưới đây để tạo việc mới!';
        }
      }
    } else {
      if (emptyContainer) emptyContainer.classList.add('hidden');
    }

    // Render respective view
    if (state.currentView === 'timeline') {
      timelineView.classList.remove('hidden');
      listView.classList.add('hidden');
      matrixView.classList.add('hidden');
      renderTimelineView(filteredTasks);
    } else if (state.currentView === 'list') {
      timelineView.classList.add('hidden');
      listView.classList.remove('hidden');
      matrixView.classList.add('hidden');
      renderListView(filteredTasks);
    } else if (state.currentView === 'matrix') {
      timelineView.classList.add('hidden');
      listView.classList.add('hidden');
      matrixView.classList.remove('hidden');
      renderMatrixView(filteredTasks);
    }
  }

  // =========================================================================
  // VIEW 1: TIMELINE VIEW RENDERING
  // =========================================================================
  function renderTimelineView(tasks) {
    const container = document.getElementById('timelineSectionsContainer');
    if (!container) return;

    if (tasks.length === 0) {
      container.innerHTML = '';
      return;
    }

    // Group tasks into periods:
    // Buổi Sáng: 05:00 - 11:59
    // Buổi Chiều: 12:00 - 17:59
    // Buổi Tối: 18:00 - 23:59
    const periods = [
      { id: 'morning', label: 'Buổi Sáng', icon: '🌅', range: '05:00 - 11:59', minStart: 300, minEnd: 719, tasks: [] },
      { id: 'afternoon', label: 'Buổi Chiều', icon: '☀️', range: '12:00 - 17:59', minStart: 720, minEnd: 1079, tasks: [] },
      { id: 'evening', label: 'Buổi Tối', icon: '🌙', range: '18:00 - 23:59', minStart: 1080, minEnd: 1440, tasks: [] }
    ];

    tasks.forEach(task => {
      const startMin = timeToMinutes(task.startTime);
      if (startMin < 720) {
        periods[0].tasks.push(task);
      } else if (startMin < 1080) {
        periods[1].tasks.push(task);
      } else {
        periods[2].tasks.push(task);
      }
    });

    const currentMin = getCurrentMinutes();
    const isToday = state.selectedDate === getTodayDateString();

    let html = '';
    periods.forEach(p => {
      if (p.tasks.length === 0) return;

      html += `
        <div class="timeline-period-block">
          <div class="period-heading">
            <span class="period-badge">${p.icon} ${p.label}</span>
            <span class="period-range">${p.range}</span>
            <span class="pill-count">${p.tasks.length} việc</span>
          </div>
          <div class="timeline-slot-list">
            ${p.tasks.map(task => renderTaskCardHTML(task, isToday, currentMin)).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    attachCardActionListeners(container);
    updateTimelineMarker();
  }

  function updateTimelineMarker() {
    const marker = document.getElementById('timelineNowMarker');
    if (!marker) return;

    const isToday = state.selectedDate === getTodayDateString();
    if (!isToday || state.currentView !== 'timeline') {
      marker.style.display = 'none';
      return;
    }

    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    // If before 05:00 or after 23:59, hide marker
    if (currentMin < 300 || currentMin > 1439) {
      marker.style.display = 'none';
      return;
    }

    marker.style.display = 'flex';
    const tag = document.getElementById('nowTimeTag');
    if (tag) {
      tag.textContent = `${minutesToTime(currentMin)} Hiện tại`;
    }
  }

  // =========================================================================
  // VIEW 2: SMART LIST VIEW RENDERING
  // =========================================================================
  function renderListView(tasks) {
    const container = document.getElementById('listGroupsContainer');
    if (!container) return;

    if (tasks.length === 0) {
      container.innerHTML = '';
      return;
    }

    const isToday = state.selectedDate === getTodayDateString();
    const currentMin = getCurrentMinutes();

    // Group tasks into High Priority (Rất quan trọng & Quan trọng) vs Secondary (Bình thường & Thấp)
    const highPriorityTasks = tasks.filter(t => t.priority === 'p1' || t.priority === 'p2');
    const normalPriorityTasks = tasks.filter(t => t.priority === 'p3' || t.priority === 'p4');

    let html = '';

    if (highPriorityTasks.length > 0) {
      html += `
        <div class="list-group-card">
          <div class="list-group-header">
            <div class="list-group-title" style="color: var(--p1-urgent);">
              🔥 Nhóm Việc Quan Trọng Cần Ưu Tiên
            </div>
            <span class="list-group-count">${highPriorityTasks.length} việc</span>
          </div>
          <div class="timeline-slot-list">
            ${highPriorityTasks.map(t => renderTaskCardHTML(t, isToday, currentMin)).join('')}
          </div>
        </div>
      `;
    }

    if (normalPriorityTasks.length > 0) {
      html += `
        <div class="list-group-card">
          <div class="list-group-header">
            <div class="list-group-title" style="color: var(--p3-normal);">
              ⚡ Nhóm Việc Thường Nhật & Không Quan Trọng
            </div>
            <span class="list-group-count">${normalPriorityTasks.length} việc</span>
          </div>
          <div class="timeline-slot-list">
            ${normalPriorityTasks.map(t => renderTaskCardHTML(t, isToday, currentMin)).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    attachCardActionListeners(container);
  }

  // =========================================================================
  // VIEW 3: EISENHOWER MATRIX VIEW RENDERING
  // =========================================================================
  function renderMatrixView(tasks) {
    const q1 = document.getElementById('quadTasks1');
    const q2 = document.getElementById('quadTasks2');
    const q3 = document.getElementById('quadTasks3');
    const q4 = document.getElementById('quadTasks4');

    if (!q1 || !q2 || !q3 || !q4) return;

    const t1 = tasks.filter(t => t.priority === 'p1');
    const t2 = tasks.filter(t => t.priority === 'p2');
    const t3 = tasks.filter(t => t.priority === 'p3');
    const t4 = tasks.filter(t => t.priority === 'p4');

    q1.innerHTML = renderMatrixQuadrantItems(t1, 'Không có việc khẩn cấp!');
    q2.innerHTML = renderMatrixQuadrantItems(t2, 'Chưa có việc trong mục này.');
    q3.innerHTML = renderMatrixQuadrantItems(t3, 'Không có việc thuộc mục này.');
    q4.innerHTML = renderMatrixQuadrantItems(t4, 'Không có việc không quan trọng.');

    attachCardActionListeners(document.getElementById('matrixView'));
  }

  function renderMatrixQuadrantItems(quadTasks, emptyMsg) {
    if (quadTasks.length === 0) {
      return `<div class="quad-empty-hint">${emptyMsg}</div>`;
    }

    return quadTasks.map(t => {
      const cat = CATEGORIES[t.category] || CATEGORIES.work;
      return `
        <div class="matrix-mini-card ${t.completed ? 'is-completed' : ''}" data-id="${t.id}">
          <div class="matrix-mini-left">
            <div class="task-checkbox-wrap">
              <input type="checkbox" class="task-checkbox task-check-toggle" data-id="${t.id}" ${t.completed ? 'checked' : ''} aria-label="Hoàn thành việc">
            </div>
            <div class="matrix-mini-info">
              <span class="matrix-mini-title ${t.completed ? 'completed-text' : ''}" title="${escapeHTML(t.title)}">${escapeHTML(t.title)}</span>
              <div class="matrix-mini-meta">
                <span>⏰ ${t.startTime} - ${t.endTime}</span>
                <span>•</span>
                <span>${cat.icon} ${cat.label}</span>
              </div>
            </div>
          </div>
          <div class="task-actions">
            <button class="btn-card-action btn-edit-task" data-id="${t.id}" title="Sửa">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-card-action delete btn-delete-task" data-id="${t.id}" title="Xóa">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // TASK CARD HTML GENERATOR
  // =========================================================================
  function renderTaskCardHTML(task, isToday, currentMin) {
    const priority = PRIORITIES[task.priority] || PRIORITIES.p2;
    const category = CATEGORIES[task.category] || CATEGORIES.work;
    const reminderLabel = REMINDER_LABELS[task.reminder] || task.reminder;

    const startMin = timeToMinutes(task.startTime);
    const endMin = timeToMinutes(task.endTime);

    const isActiveNow = isToday && !task.completed && currentMin >= startMin && currentMin <= endMin;

    return `
      <div class="task-card priority-${priority.code} ${task.completed ? 'is-completed' : ''} ${isActiveNow ? 'is-active-now' : ''}" data-id="${task.id}">
        <div class="task-card-left">
          <div class="task-checkbox-wrap">
            <input type="checkbox" class="task-checkbox task-check-toggle" data-id="${task.id}" ${task.completed ? 'checked' : ''} aria-label="Đánh dấu hoàn tất">
          </div>

          <div class="task-time-box">
            <span class="task-time-start">${task.startTime}</span>
            <span class="task-time-end">đến ${task.endTime}</span>
          </div>

          <div class="task-content-box">
            <div class="task-title-row">
              <span class="task-name">${escapeHTML(task.title)}</span>
              ${isActiveNow ? '<span class="status-badge" style="font-size: 0.65rem; padding: 0.1rem 0.4rem;"><span class="pulsing-dot"></span> ĐANG DIỄN RA</span>' : ''}
            </div>

            <div class="task-meta-row">
              <span class="badge-priority ${priority.badgeClass}">
                ${priority.icon} ${priority.label}
              </span>
              <span class="badge-category">
                ${category.icon} ${category.label}
              </span>
              ${task.reminder !== 'none' ? `
                <span class="badge-reminder" title="Nhắc nhở: ${reminderLabel}">
                  🔔 ${reminderLabel}
                </span>
              ` : ''}
            </div>

            ${task.notes ? `<div class="task-notes-snippet" title="${escapeHTML(task.notes)}">${escapeHTML(task.notes)}</div>` : ''}
          </div>
        </div>

        <div class="task-actions">
          <button class="btn-card-action btn-edit-task" data-id="${task.id}" title="Chỉnh sửa công việc">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-card-action delete btn-delete-task" data-id="${task.id}" title="Xóa công việc này">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  }

  function attachCardActionListeners(parent) {
    if (!parent) return;

    // Checkbox completed toggle
    parent.querySelectorAll('.task-check-toggle').forEach(chk => {
      chk.onchange = (e) => {
        const id = e.target.dataset.id;
        toggleTaskCompleted(id);
      };
    });

    // Edit button
    parent.querySelectorAll('.btn-edit-task').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        openEditTaskModal(id);
      };
    });

    // Delete button
    parent.querySelectorAll('.btn-delete-task').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        deleteTask(id);
      };
    });
  }

  // =========================================================================
  // TASK CRUD OPERATIONS
  // =========================================================================
  function toggleTaskCompleted(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    saveTasks();

    if (task.completed) {
      AudioService.playCompleteSound();
      showToast(`Đã hoàn thành: "${task.title}" 🎉`, 'success');
    } else {
      AudioService.playSoftPing();
    }

    renderCurrentView();
  }

  function deleteTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    if (confirm(`Bạn có chắc muốn xóa công việc "${task.title}" không?`)) {
      state.tasks = state.tasks.filter(t => t.id !== taskId);
      saveTasks();
      showToast('Đã xóa công việc khỏi lịch trình', 'info');
      renderCurrentView();
    }
  }

  function openAddTaskModal() {
    const modal = document.getElementById('taskModalBackdrop');
    const heading = document.getElementById('modalHeading');
    const form = document.getElementById('taskForm');
    const idInput = document.getElementById('taskIdInput');
    const saveBtnText = document.getElementById('saveBtnText');

    heading.textContent = 'Thêm Lịch Trình Mới';
    saveBtnText.textContent = 'Lưu Lịch Trình';
    form.reset();
    idInput.value = '';

    // Defaults
    document.getElementById('taskDateInput').value = state.selectedDate;

    // Suggest next logical hour based on current time or last task
    const now = new Date();
    const currentHour = now.getHours();
    const nextHour = (currentHour + 1) % 24;
    const endHour = (nextHour + 1) % 24;

    document.getElementById('taskStartTimeInput').value = `${String(nextHour).padStart(2, '0')}:00`;
    document.getElementById('taskEndTimeInput').value = `${String(endHour).padStart(2, '0')}:00`;

    // Priority default: p2 (Quan trọng)
    const p2Radio = document.querySelector('input[name="taskPriority"][value="p2"]');
    if (p2Radio) p2Radio.checked = true;

    modal.classList.remove('hidden');
    document.getElementById('taskTitleInput').focus();
  }

  function openEditTaskModal(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const modal = document.getElementById('taskModalBackdrop');
    const heading = document.getElementById('modalHeading');
    const idInput = document.getElementById('taskIdInput');
    const saveBtnText = document.getElementById('saveBtnText');

    heading.textContent = 'Chỉnh Sửa Lịch Trình';
    saveBtnText.textContent = 'Cập Nhật Lịch Trình';

    idInput.value = task.id;
    document.getElementById('taskTitleInput').value = task.title;
    document.getElementById('taskDateInput').value = task.date;
    document.getElementById('taskStartTimeInput').value = task.startTime;
    document.getElementById('taskEndTimeInput').value = task.endTime;
    document.getElementById('taskCategorySelect').value = task.category;
    document.getElementById('taskReminderSelect').value = task.reminder;
    document.getElementById('taskNotesInput').value = task.notes || '';

    // Check matching priority radio
    const radio = document.querySelector(`input[name="taskPriority"][value="${task.priority}"]`);
    if (radio) radio.checked = true;

    modal.classList.remove('hidden');
  }

  function closeTaskModal() {
    const modal = document.getElementById('taskModalBackdrop');
    modal.classList.add('hidden');
  }

  function handleTaskFormSubmit(e) {
    e.preventDefault();

    const idInput = document.getElementById('taskIdInput').value;
    const title = document.getElementById('taskTitleInput').value.trim();
    const date = document.getElementById('taskDateInput').value;
    const startTime = document.getElementById('taskStartTimeInput').value;
    const endTime = document.getElementById('taskEndTimeInput').value;
    const priority = document.querySelector('input[name="taskPriority"]:checked')?.value || 'p2';
    const category = document.getElementById('taskCategorySelect').value;
    const reminder = document.getElementById('taskReminderSelect').value;
    const notes = document.getElementById('taskNotesInput').value.trim();

    if (!title || !date || !startTime || !endTime) {
      showToast('Vui lòng điền đầy đủ các thông tin bắt buộc!', 'warning');
      return;
    }

    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      showToast('Giờ kết thúc phải lớn hơn giờ bắt đầu!', 'warning');
      return;
    }

    if (idInput) {
      // Update existing task
      const taskIndex = state.tasks.findIndex(t => t.id === idInput);
      if (taskIndex !== -1) {
        state.tasks[taskIndex] = {
          ...state.tasks[taskIndex],
          title,
          date,
          startTime,
          endTime,
          priority,
          category,
          reminder,
          notes,
          notified: false // reset notification in case time changed
        };
        showToast('Đã cập nhật lịch trình thành công!', 'success');
      }
    } else {
      // Create new task
      const newTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        title,
        date,
        startTime,
        endTime,
        priority,
        category,
        reminder,
        notes,
        completed: false,
        notified: false,
        createdAt: Date.now()
      };
      state.tasks.push(newTask);
      showToast('Đã thêm công việc mới vào lịch trình!', 'success');
    }

    saveTasks();
    closeTaskModal();

    // Auto-switch selected date to the task's date so user sees it right away
    if (state.selectedDate !== date) {
      state.selectedDate = date;
      updateDateSelectorUI();
    }

    renderCurrentView();
  }

  // =========================================================================
  // ALARM POPUP MODAL HANDLERS
  // =========================================================================
  function openAlarmModal(task) {
    state.activeAlarmTaskId = task.id;

    const modal = document.getElementById('alarmModalBackdrop');
    const priorityTag = document.getElementById('alarmPriorityTag');
    const titleEl = document.getElementById('alarmTaskTitle');
    const timeEl = document.getElementById('alarmTaskTime');
    const catEl = document.getElementById('alarmTaskCat');
    const noteEl = document.getElementById('alarmTaskNote');

    const priorityInfo = PRIORITIES[task.priority] || PRIORITIES.p2;
    const catInfo = CATEGORIES[task.category] || CATEGORIES.work;

    priorityTag.textContent = `${priorityInfo.icon} VIỆC ${priorityInfo.label.toUpperCase()}`;
    priorityTag.className = `alarm-priority-tag ${priorityInfo.badgeClass}`;

    titleEl.textContent = task.title;
    timeEl.textContent = `⏰ ${task.startTime} - ${task.endTime}`;
    catEl.textContent = `${catInfo.icon} ${catInfo.label}`;
    noteEl.textContent = task.notes || 'Đã đến giờ thực hiện theo lịch trình đã lên. Hãy tập trung bắt đầu ngay!';

    modal.classList.remove('hidden');
  }

  function closeAlarmModal() {
    const modal = document.getElementById('alarmModalBackdrop');
    modal.classList.add('hidden');
    state.activeAlarmTaskId = null;
  }

  function snoozeActiveAlarm() {
    if (!state.activeAlarmTaskId) return closeAlarmModal();

    const task = state.tasks.find(t => t.id === state.activeAlarmTaskId);
    if (task) {
      // Snooze: temporarily reschedule start time or alert in 5 mins
      task.notified = false;
      const currentMin = getCurrentMinutes();
      task.startTime = minutesToTime(currentMin + 5);
      saveTasks();
      showToast(`Đã hoãn nhắc "${task.title}" sau 5 phút nữa ⏱️`, 'info');
      AudioService.playSoftPing();
    }
    closeAlarmModal();
    renderCurrentView();
  }

  function completeActiveAlarm() {
    if (!state.activeAlarmTaskId) return closeAlarmModal();

    toggleTaskCompleted(state.activeAlarmTaskId);
    closeAlarmModal();
  }

  // =========================================================================
  // SETTINGS & DATA EXPORT/IMPORT
  // =========================================================================
  function openSettingsModal() {
    document.getElementById('settingsModalBackdrop').classList.remove('hidden');
  }

  function closeSettingsModal() {
    document.getElementById('settingsModalBackdrop').classList.add('hidden');
  }

  function testSoundChime() {
    AudioService.playReminderChime();
    showToast('Đang phát thử nghiệm âm thanh chuông báo 🔔', 'info');
  }

  function resetSampleData() {
    if (confirm('Khôi phục dữ liệu lịch trình mẫu? Các việc hiện tại sẽ được thay bằng mẫu chuẩn.')) {
      state.tasks = getSampleTasks();
      saveTasks();
      state.selectedDate = getTodayDateString();
      updateDateSelectorUI();
      renderCurrentView();
      showToast('Đã khôi phục dữ liệu lịch trình mẫu thành công!', 'success');
      closeSettingsModal();
    }
  }

  function clearAllData() {
    if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ lịch trình không? Thao tác này không thể hoàn tác!')) {
      state.tasks = [];
      saveTasks();
      renderCurrentView();
      showToast('Đã xóa sạch mọi công việc trong lịch trình.', 'warning');
      closeSettingsModal();
    }
  }

  function exportData() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.tasks, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `dailyflow_backup_${getTodayDateString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Đã xuất file sao lưu lịch trình thành công!', 'success');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (Array.isArray(imported)) {
          state.tasks = imported;
          saveTasks();
          renderCurrentView();
          showToast(`Nhập dữ liệu thành công! Đã nạp ${imported.length} công việc.`, 'success');
          closeSettingsModal();
        } else {
          showToast('File JSON không hợp lệ!', 'danger');
        }
      } catch (err) {
        showToast('Lỗi khi đọc file sao lưu!', 'danger');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // =========================================================================
  // TOAST NOTIFICATION UTILITY
  // =========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warning') icon = '⚠️';
    if (type === 'danger') icon = '❌';

    toast.innerHTML = `
      <span>${icon}</span>
      <span style="flex: 1;">${escapeHTML(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // =========================================================================
  // UI EVENT BINDINGS
  // =========================================================================
  function updateDateSelectorUI() {
    const todayStr = getTodayDateString();
    const tomorrowStr = getDateOffset(1);

    const btnToday = document.getElementById('btnDateToday');
    const btnTomorrow = document.getElementById('btnDateTomorrow');
    const dateInput = document.getElementById('selectedDateInput');

    if (dateInput) dateInput.value = state.selectedDate;

    if (btnToday) {
      btnToday.classList.toggle('active', state.selectedDate === todayStr);
    }
    if (btnTomorrow) {
      btnTomorrow.classList.toggle('active', state.selectedDate === tomorrowStr);
    }
  }

  function updateNotificationUI() {
    const btn = document.getElementById('btnToggleNotify');
    const text = document.getElementById('notifyStatusText');

    if ('Notification' in window && Notification.permission === 'granted' && state.settings.notificationsEnabled) {
      btn.classList.add('active');
      text.textContent = 'Thông Báo: Bật';
    } else {
      btn.classList.remove('active');
      text.textContent = 'Bật Thông Báo';
    }
  }

  function updateSoundUI() {
    const iconOn = document.getElementById('soundIconOn');
    const iconOff = document.getElementById('soundIconOff');
    const text = document.getElementById('soundStatusText');

    if (state.settings.soundEnabled) {
      iconOn.classList.remove('hidden');
      iconOff.classList.add('hidden');
      text.textContent = 'Chuông: Bật';
    } else {
      iconOn.classList.add('hidden');
      iconOff.classList.remove('hidden');
      text.textContent = 'Chuông: Tắt';
    }
  }

  function updateThemeUI() {
    document.documentElement.setAttribute('data-theme', state.settings.theme);
    const iconDark = document.getElementById('themeIconDark');
    const iconLight = document.getElementById('themeIconLight');

    if (state.settings.theme === 'dark') {
      iconDark.classList.remove('hidden');
      iconLight.classList.add('hidden');
    } else {
      iconDark.classList.add('hidden');
      iconLight.classList.remove('hidden');
    }
  }

  function bindEvents() {
    // Add Task Button
    document.getElementById('btnAddTaskModal').onclick = openAddTaskModal;
    document.getElementById('btnEmptyAdd').onclick = openAddTaskModal;

    // Modal Close & Cancel
    document.getElementById('btnCloseTaskModal').onclick = closeTaskModal;
    document.getElementById('btnCancelTaskModal').onclick = closeTaskModal;
    document.getElementById('taskModalBackdrop').onclick = (e) => {
      if (e.target.id === 'taskModalBackdrop') closeTaskModal();
    };

    // Task Form Submit
    document.getElementById('taskForm').onsubmit = handleTaskFormSubmit;

    // Alarm Modal Actions
    document.getElementById('btnAlarmDismiss').onclick = closeAlarmModal;
    document.getElementById('btnAlarmSnooze').onclick = snoozeActiveAlarm;
    document.getElementById('btnAlarmComplete').onclick = completeActiveAlarm;

    // Date Navigation
    document.getElementById('btnDateToday').onclick = () => {
      state.selectedDate = getTodayDateString();
      updateDateSelectorUI();
      renderCurrentView();
    };

    document.getElementById('btnDateTomorrow').onclick = () => {
      state.selectedDate = getDateOffset(1);
      updateDateSelectorUI();
      renderCurrentView();
    };

    document.getElementById('selectedDateInput').onchange = (e) => {
      if (e.target.value) {
        state.selectedDate = e.target.value;
        updateDateSelectorUI();
        renderCurrentView();
      }
    };

    document.getElementById('btnPrevDay').onclick = () => {
      const cur = new Date(state.selectedDate);
      cur.setDate(cur.getDate() - 1);
      state.selectedDate = formatDateString(cur);
      updateDateSelectorUI();
      renderCurrentView();
    };

    document.getElementById('btnNextDay').onclick = () => {
      const cur = new Date(state.selectedDate);
      cur.setDate(cur.getDate() + 1);
      state.selectedDate = formatDateString(cur);
      updateDateSelectorUI();
      renderCurrentView();
    };

    // View Switcher Tabs
    const viewTabs = [
      { id: 'tabViewTimeline', view: 'timeline' },
      { id: 'tabViewList', view: 'list' },
      { id: 'tabViewMatrix', view: 'matrix' }
    ];

    viewTabs.forEach(t => {
      const el = document.getElementById(t.id);
      if (el) {
        el.onclick = () => {
          viewTabs.forEach(item => document.getElementById(item.id)?.classList.remove('active'));
          el.classList.add('active');
          state.currentView = t.view;
          renderCurrentView();
        };
      }
    });

    // Filter Pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.onclick = () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        state.activeFilter = pill.dataset.filter;
        renderCurrentView();
      };
    });

    // Search Input
    const searchInput = document.getElementById('searchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');

    searchInput.oninput = (e) => {
      state.searchQuery = e.target.value;
      btnClearSearch.classList.toggle('hidden', !state.searchQuery);
      renderCurrentView();
    };

    btnClearSearch.onclick = () => {
      searchInput.value = '';
      state.searchQuery = '';
      btnClearSearch.classList.add('hidden');
      renderCurrentView();
    };

    // Notification Permission Button
    document.getElementById('btnToggleNotify').onclick = () => {
      NotificationService.requestPermission();
    };

    // Sound Toggle Button
    document.getElementById('btnToggleSound').onclick = () => {
      state.settings.soundEnabled = !state.settings.soundEnabled;
      saveSettings();
      updateSoundUI();
      if (state.settings.soundEnabled) {
        AudioService.playTone(880, 0.2);
        showToast('Đã bật âm thanh chuông nhắc hẹn 🔔', 'info');
      } else {
        showToast('Đã tắt âm thanh chuông nhắc', 'info');
      }
    };

    // Theme Toggle
    document.getElementById('btnThemeToggle').onclick = () => {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      saveSettings();
      updateThemeUI();
    };

    // Settings Modal
    document.getElementById('btnOpenSettings').onclick = openSettingsModal;
    document.getElementById('btnCloseSettingsModal').onclick = closeSettingsModal;
    document.getElementById('settingsModalBackdrop').onclick = (e) => {
      if (e.target.id === 'settingsModalBackdrop') closeSettingsModal();
    };

    document.getElementById('btnTestSound').onclick = testSoundChime;
    document.getElementById('btnResetSample').onclick = resetSampleData;
    document.getElementById('btnClearAllData').onclick = clearAllData;
    document.getElementById('btnExportData').onclick = exportData;
    document.getElementById('fileImportInput').onchange = importData;

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // Press 'N' or 'n' when not typing in input to open Add Task Modal
      if ((e.key === 'n' || e.key === 'N') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        openAddTaskModal();
      }
      // Press Escape to close modal
      if (e.key === 'Escape') {
        closeTaskModal();
        closeSettingsModal();
        closeAlarmModal();
      }
    });
  }

  // =========================================================================
  // BOOTSTRAP APPLICATION
  // =========================================================================
  function init() {
    loadData();
    updateThemeUI();
    updateSoundUI();
    updateNotificationUI();
    updateDateSelectorUI();
    bindEvents();
    renderCurrentView();
    startHeartbeatEngine();
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
