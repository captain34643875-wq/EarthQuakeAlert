/**
 * background.js
 * Manifest V3 service worker
 */

importScripts('earthquakeService.js');

const EARTHQUAKE_ALARM_NAME = "EARTHQUAKE_POLLING_ALARM";
const POLLING_INTERVAL_MINUTES = 0.12; // 7초 (실시간 속보를 위해)

const STORAGE_KEYS = {
  LAST_EVENT_TIME: "lastEventTime",
  RECENT_EARTHQUAKES: "recentEarthquakes",
  KNOWN_EARTHQUAKE_IDS: "knownEarthquakeIds" // 새 지진 판단을 위한 ID 저장소
};

function getLastEventTime() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.LAST_EVENT_TIME, (result) => {
      if (
        result &&
        Object.prototype.hasOwnProperty.call(result, STORAGE_KEYS.LAST_EVENT_TIME)
      ) {
        resolve(result[STORAGE_KEYS.LAST_EVENT_TIME]);
      } else {
        resolve(null);
      }
    });
  });
}

function setLastEventTime(timeString) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.LAST_EVENT_TIME]: timeString
      },
      () => resolve()
    );
  });
}

function setRecentEarthquakes(earthquakes) {
  return new Promise((resolve) => {
    const limited = earthquakes.slice(0, 20);
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.RECENT_EARTHQUAKES]: limited
      },
      () => resolve()
    );
  });
}

/**
 * 알려진 지진 ID 목록 가져오기
 * @returns {Promise<Set>}
 */
function getKnownEarthquakeIds() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.KNOWN_EARTHQUAKE_IDS, (result) => {
      const ids = result[STORAGE_KEYS.KNOWN_EARTHQUAKE_IDS] || [];
      resolve(new Set(ids));
    });
  });
}

/**
 * 알려진 지진 ID 목록 저장
 * @param {Set} knownIds
 * @returns {Promise}
 */
function setKnownEarthquakeIds(knownIds) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.KNOWN_EARTHQUAKE_IDS]: Array.from(knownIds)
      },
      () => resolve()
    );
  });
}

/**
 * 실제 새 지진만 필터링 (속보 핵심 로직)
 * @param {Array} earthquakes - 전체 지진 데이터
 * @param {Set} knownIds - 알려진 지진 ID 목록
 * @returns {Array} 새로운 지진만
 */
function filterNewEarthquakes(earthquakes, knownIds) {
  return earthquakes.filter(eq => !knownIds.has(eq.id));
}

/**
 * 속보 알림 생성 (규모 필터링 포함)
 * @param {Object} quake - 지진 정보
 */
function triggerEarthquakeAlert(quake) {
  // M4.0 이상만 속보
  if (typeof quake.magnitude === 'number' && quake.magnitude >= 4.0) {
    const title = getAlertTitle(quake.magnitude);
    const body = getAlertBody(quake);
    
    // 규모별 색상과 아이콘
    const options = {
      type: "basic",
      iconUrl: getAlertIcon(quake.magnitude),
      title,
      message: body,
      priority: 2, // 높은 우선순위
      requireInteraction: quake.magnitude >= 5.0 // M5.0 이상은 자동 닫기 방지
    };

    const notificationId = `alert_${quake.id}`;
    chrome.notifications.create(notificationId, options, () => {
      console.log(`🚨 지진 속보 발송: M${quake.magnitude} - ${quake.location}`);
    });
  }
}

/**
 * 규모별 알림 제목
 * @param {number} magnitude
 * @returns {string}
 */
function getAlertTitle(magnitude) {
  if (magnitude >= 6.0) return "🚨 대규모 지진 속보!";
  if (magnitude >= 5.0) return "⚠️ 지진 경보!";
  return "📢 지진 주의보";
}

/**
 * 알림 본문 생성
 * @param {Object} quake
 * @returns {string}
 */
function getAlertBody(quake) {
  const location = quake.location || "알 수 없는 위치";
  const magnitude = typeof quake.magnitude === 'number' ? quake.magnitude.toFixed(1) : "?";
  const time = new Date(quake.time);
  const relativeTime = getRelativeTimeForAlert(time);
  
  return `규모 M${magnitude} / ${location} (${relativeTime})`;
}

/**
 * 규모별 알림 아이콘
 * @param {number} magnitude
 * @returns {string}
 */
function getAlertIcon(magnitude) {
  if (magnitude >= 6.0) return "icon128-red.png";
  if (magnitude >= 5.0) return "icon128-orange.png";
  return "icon128-yellow.png";
}

/**
 * 알림용 상대 시간
 * @param {Date} date
 * @returns {string}
 */
function getRelativeTimeForAlert(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  
  if (diffSecs < 60) return "방금 전";
  if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}분 전`;
  return `${Math.floor(diffSecs / 3600)}시간 전`;
}

function showEarthquakeNotification(quake) {
  const title = `지진 발생 (M${quake.magnitude || "?"})`;
  const date = new Date(quake.time);
  const bodyLines = [];

  if (quake.location) {
    bodyLines.push(`위치: ${quake.location}`);
  } else {
    bodyLines.push("위치: 정보 없음");
  }

  if (typeof quake.depth === "number") {
    bodyLines.push(`깊이: ${quake.depth.toFixed(1)} km`);
  }

  bodyLines.push(`발생 시각: ${date.toLocaleString()}`);
  bodyLines.push(`출처: ${quake.source}`);

  const message = bodyLines.join("\n");
  const notificationId = quake.id ? `eq_${quake.id}` : undefined;

  const options = {
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message,
    priority: 2 // 0~2, 높을수록 중요
  };

  if (notificationId) {
    chrome.notifications.create(notificationId, options, () => {});
  } else {
    chrome.notifications.create(options, () => {});
  }
}

async function checkForNewEarthquakes() {
  try {
    const allEarthquakes = await self.EarthquakeService.fetchAllEarthquakeData();

    if (!allEarthquakes || allEarthquakes.length === 0) {
      return;
    }

    const recentEarthquakes = self.EarthquakeService.filterRecentEarthquakes(allEarthquakes);
    const knownIds = await getKnownEarthquakeIds();
    
    // 🚨 속보 핵심: 실제 새 지진만 필터링
    const newEarthquakes = filterNewEarthquakes(recentEarthquakes, knownIds);
    
    if (newEarthquakes.length > 0) {
      console.log(`🔍 새 지진 ${newEarthquakes.length}개 감지됨`);
      
      // 새 지진에 대해 속보 발송
      newEarthquakes.forEach(quake => {
        triggerEarthquakeAlert(quake);
      });
      
      // 알려진 ID 목록 업데이트
      const updatedKnownIds = new Set([...knownIds]);
      newEarthquakes.forEach(quake => updatedKnownIds.add(quake.id));
      await setKnownEarthquakeIds(updatedKnownIds);
    }

    // 기존 로직: 최신 데이터 저장 (팝업 표시용)
    const newestTime = recentEarthquakes.length > 0 ? recentEarthquakes[0].time : null;
    if (newestTime) {
      await setLastEventTime(newestTime);
    }

    // 팝업용 데이터 (isNew 플래그 설정)
    const recentWithFlag = recentEarthquakes.slice(0, 20).map((e) => ({
      ...e,
      isNew: newEarthquakes.some((n) => n.id === e.id)
    }));

    await setRecentEarthquakes(recentWithFlag);
    
  } catch (error) {
    console.error("지진 체크 오류:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(EARTHQUAKE_ALARM_NAME, {
    periodInMinutes: POLLING_INTERVAL_MINUTES
  });

  // 초기 실행 시 알려진 ID 초기화
  getKnownEarthquakeIds().then(knownIds => {
    if (knownIds.size === 0) {
      // 첫 설치 시 현재 데이터를 알려진 것으로 처리 (불필요한 알림 방지)
      checkForNewEarthquakes().then(() => {
        console.log("🚀 지진 속보 시스템 초기화 완료");
      });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(EARTHQUAKE_ALARM_NAME, (alarm) => {
    if (!alarm) {
      // 알람 생성 (2분마다 데이터 확인)
      chrome.alarms.create('fetchEarthquakeData', {
        delayInMinutes: 0,
        periodInMinutes: 2
      });
    }
  });

  checkForNewEarthquakes();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EARTHQUAKE_ALARM_NAME) {
    checkForNewEarthquakes();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "FORCE_REFRESH_EARTHQUAKES") {
    checkForNewEarthquakes().then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  return false;
});
