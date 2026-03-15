/**
 * background.js
 * Manifest V3 서비스 워커 스크립트
 * - 주기적으로(20초마다) 여러 기관의 지진 데이터를 가져온다
 * - 새 지진이 감지되면 Chrome Notification API로 알림을 띄운다
 * - popup에서 사용할 수 있도록 최근 지진 목록을 chrome.storage.local에 저장한다
 */

// earthquakeService.js import (Chrome Extension 환경)
importScripts('earthquakeService.js');

// 알람 이름 (임의의 고유 문자열)
const EARTHQUAKE_ALARM_NAME = "EARTHQUAKE_POLLING_ALARM";

// 폴링 간격 (분 단위) - 20초이므로 0.33분
const POLLING_INTERVAL_MINUTES = 0.33;

// chrome.storage.local에 사용할 키 이름 정의
const STORAGE_KEYS = {
  LAST_EVENT_TIME: "lastEventTime", // 마지막으로 감지한 지진의 발생 시각 (ISO string)
  RECENT_EARTHQUAKES: "recentEarthquakes" // 최근 지진 리스트 (배열)
};

/**
 * chrome.storage.local에서 저장된 마지막 지진 시간을 가져온다
 * @returns {Promise<string|null>} ISO string 또는 null
 */
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

/**
 * 마지막 지진 시간을 저장한다
 * @param {string} timeString - ISO string
 * @returns {Promise<void>}
 */
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

/**
 * 최근 지진 리스트를 저장한다 (최대 20개)
 * @param {Array} earthquakes
 * @returns {Promise<void>}
 */
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
 * Chrome Notification API를 이용해 새 지진 알림을 띄운다
 * @param {Object} quake - 지진 정보 객체
 */
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

  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: "icon128.png",
      title,
      message,
      priority: 2 // 0~2, 높을수록 중요
    },
    () => {
      // 콜백은 생략 가능
    }
  );
}

/**
 * 새 지진을 체크하고, 새로 감지된 지진에 대해 알림을 띄우고,
 * 최근 지진 리스트를 저장한다
 */
async function checkForNewEarthquakes() {
  try {
    console.log('지진 데이터 확인 시작...');
    
    // 모든 기관에서 지진 데이터 가져오기
    const allEarthquakes = await EarthquakeService.fetchAllEarthquakeData();
    
    if (!allEarthquakes || allEarthquakes.length === 0) {
      console.log('가져온 지진 데이터가 없음');
      return;
    }

    // 최근 24시간 지진만 필터링
    const recentEarthquakes = EarthquakeService.filterRecentEarthquakes(allEarthquakes);
    
    const lastEventTime = await getLastEventTime();

    // 아직 어떤 지진도 본 적이 없는 경우: 초기화
    if (lastEventTime === null) {
      if (recentEarthquakes.length > 0) {
        const newestTime = recentEarthquakes[0].time;
        const normalized = recentEarthquakes.slice(0, 20).map((e) => ({
          ...e,
          isNew: false
        }));
        
        await Promise.all([
          setRecentEarthquakes(normalized),
          setLastEventTime(newestTime)
        ]);
        
        console.log(`초기화 완료: ${normalized.length}개 지진 저장`);
      }
      return;
    }

    // 새로 감지된 지진들만 필터링
    const newEvents = recentEarthquakes.filter(
      (e) => e.time && new Date(e.time) > new Date(lastEventTime)
    );

    // 새 지진이 없으면, 최신 리스트만 업데이트
    if (newEvents.length === 0) {
      const normalized = recentEarthquakes.slice(0, 20).map((e) => ({
        ...e,
        isNew: false
      }));
      await setRecentEarthquakes(normalized);
      console.log('새 지진 없음, 리스트만 업데이트');
      return;
    }

    // 새 지진이 있는 경우: 알림 및 리스트 업데이트
    console.log(`${newEvents.length}개의 새 지진 발견!`);
    
    newEvents.forEach((quake) => {
      showEarthquakeNotification(quake);
    });

    const newestTime = recentEarthquakes[0].time;

    // 최근 리스트 생성 (최대 20개)
    const recentWithFlag = recentEarthquakes.slice(0, 20).map((e) => ({
      ...e,
      isNew: newEvents.some((n) => n.id === e.id)
    }));

    await Promise.all([
      setRecentEarthquakes(recentWithFlag),
      setLastEventTime(newestTime)
    ]);
    
    console.log(`업데이트 완료: ${recentWithFlag.length}개 지진 저장 (${newEvents.length}개 신규)`);
    
  } catch (error) {
    console.error("지진 데이터 확인 중 오류:", error);
  }
}

/**
 * 확장 프로그램이 설치되거나 업데이트될 때 알람을 세팅한다
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('지진 속보 확장 프로그램 설치됨');
  
  // 알람 생성: 주기적으로 EARTHQUAKE_ALARM_NAME 알람을 발생시킴
  chrome.alarms.create(EARTHQUAKE_ALARM_NAME, {
    periodInMinutes: POLLING_INTERVAL_MINUTES
  });

  // 설치 직후 한 번 즉시 체크
  checkForNewEarthquakes();
});

/**
 * 브라우저가 시작될 때(또는 서비스 워커가 다시 시작될 때) 알람이 없다면 다시 생성
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('브라우저 시작됨');
  
  chrome.alarms.get(EARTHQUAKE_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(EARTHQUAKE_ALARM_NAME, {
        periodInMinutes: POLLING_INTERVAL_MINUTES
      });
      console.log('알람 재생성됨');
    }
  });

  // 시작 시에도 한 번 즉시 체크
  checkForNewEarthquakes();
});

/**
 * 알람 발생 시 지진 데이터 체크 실행
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EARTHQUAKE_ALARM_NAME) {
    checkForNewEarthquakes();
  }
});

/**
 * popup에서 강제로 새로고침 요청을 할 때를 대비한 메시지 처리
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "FORCE_REFRESH_EARTHQUAKES") {
    checkForNewEarthquakes().then(() => {
      sendResponse({ ok: true });
    });
    // 비동기 응답을 위해 true 반환
    return true;
  }
  return false;
});
