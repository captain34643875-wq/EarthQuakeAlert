// background.js
// Manifest V3 서비스 워커 스크립트
// - 주기적으로(약 15초마다) USGS 지진 API를 호출해 최신 지진 정보를 가져온다.
// - 새 지진이 감지되면 Chrome Notification API로 알림을 띄운다.
// - popup에서 사용할 수 있도록 최근 지진 목록을 chrome.storage.local에 저장한다.

// USGS 무료 지진 API (최근 1시간, 전 세계)
const EARTHQUAKE_API_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

// 알람 이름 (임의의 고유 문자열)
const EARTHQUAKE_ALARM_NAME = "EARTHQUAKE_POLLING_ALARM";

// 폴링 간격 (분 단위) - 15초이므로 0.25분
// Chrome alarms는 최소 1분 권장이지만, 예제에서는 요구사항(10~30초) 충족을 위해 0.25분 사용.
// 실제 배포 시에는 API/브라우저 부하를 고려해 1분 이상으로 조정하는 것을 권장.
const POLLING_INTERVAL_MINUTES = 0.25;

// chrome.storage.local에 사용할 키 이름 정의
const STORAGE_KEYS = {
  LAST_EVENT_TIME: "lastEventTime", // 마지막으로 감지한 지진의 발생 시각 (ms, number)
  RECENT_EARTHQUAKES: "recentEarthquakes" // 최근 지진 리스트 (배열)
};

/**
 * USGS API에서 최신 지진 데이터를 가져와 파싱하는 함수
 * @returns {Promise<Array>} 지진 리스트 (최신순 정렬)
 */
async function fetchEarthquakes() {
  const response = await fetch(EARTHQUAKE_API_URL);
  if (!response.ok) {
    throw new Error("지진 API 요청 실패: " + response.status);
  }

  const data = await response.json();

  // USGS GeoJSON 포맷:
  // data.features는 지진 이벤트 배열
  // 각 feature는 { id, properties, geometry }
  // properties.time: 발생 시각 (ms)
  // properties.mag: 규모
  // properties.place: 위치 설명 문자열
  // geometry.coordinates: [경도, 위도, 깊이(km)]
  const events = (data.features || []).map((feature) => {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const coords = geom.coordinates || [];

    const lon = coords[0];
    const lat = coords[1];
    const depth = coords[2]; // km

    return {
      id: feature.id,
      time: props.time, // ms
      magnitude: props.mag,
      place: props.place,
      latitude: lat,
      longitude: lon,
      depth: depth,
      url: props.url // 상세 페이지 링크 (USGS)
    };
  });

  // 최근 발생 순서대로 정렬 (time 내림차순)
  events.sort((a, b) => b.time - a.time);
  return events;
}

/**
 * chrome.storage.local에서 저장된 마지막 지진 시간(ms)을 가져온다.
 * @returns {Promise<number|null>}
 */
function getLastEventTime() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.LAST_EVENT_TIME, (result) => {
      if (
        result &&
        Object.prototype.hasOwnProperty.call(
          result,
          STORAGE_KEYS.LAST_EVENT_TIME
        )
      ) {
        resolve(result[STORAGE_KEYS.LAST_EVENT_TIME]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * 마지막 지진 시간(ms)을 저장한다.
 * @param {number} timeMs
 * @returns {Promise<void>}
 */
function setLastEventTime(timeMs) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.LAST_EVENT_TIME]: timeMs
      },
      () => resolve()
    );
  });
}

/**
 * 최근 지진 리스트를 저장한다.
 * @param {Array} earthquakes
 * @returns {Promise<void>}
 */
function setRecentEarthquakes(earthquakes) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [STORAGE_KEYS.RECENT_EARTHQUAKES]: earthquakes
      },
      () => resolve()
    );
  });
}

/**
 * Chrome Notification API를 이용해 새 지진 알림을 띄운다.
 * @param {Object} quake - 지진 정보 객체
 */
function showEarthquakeNotification(quake) {
  // 알림 제목: 규모와 간단 위치
  const title = `지진 발생 (M${quake.magnitude ?? "?"})`;
  // 알림 내용: 위치 + 깊이 + 발생 시각
  const date = new Date(quake.time);
  const bodyLines = [];

  if (quake.place) {
    bodyLines.push(`위치: ${quake.place}`);
  } else {
    bodyLines.push("위치: 정보 없음");
  }

  if (typeof quake.depth === "number") {
    bodyLines.push(`깊이: ${quake.depth.toFixed(1)} km`);
  }

  bodyLines.push(`발생 시각: ${date.toLocaleString()}`);

  const message = bodyLines.join("\n");

  chrome.notifications.create(
    {
      type: "basic",
      // iconUrl은 확장 아이콘(예: icon128.png)을 프로젝트에 추가해서 사용하면 좋다.
      // 아이콘 파일이 없으면 Chrome 기본 아이콘이 사용될 수 있다.
      iconUrl: "icon128.png",
      title,
      message,
      priority: 2 // 0~2, 높을수록 중요
    },
    () => {
      // 콜백은 생략 가능. 여기서는 별도 처리 없음.
    }
  );
}

/**
 * 새 지진을 체크하고, 새로 감지된 지진에 대해 알림을 띄우고,
 * 최근 지진 리스트를 저장한다.
 */
async function checkForNewEarthquakes() {
  try {
    const [events, lastEventTime] = await Promise.all([
      fetchEarthquakes(),
      getLastEventTime()
    ]);

    if (!events || events.length === 0) {
      // 가져온 데이터가 없으면 아무것도 하지 않음
      return;
    }

    // 아직 어떤 지진도 본 적이 없는 경우:
    // - 알림은 보내지 않고, 현재 리스트만 저장 (초기화)
    if (lastEventTime === null) {
      const newestTime = events[0].time;
      // popup에서 "최근" 표시를 하도록, 최근 리스트에 isNew = false로 일괄 저장
      const normalized = events.slice(0, 20).map((e) => ({
        ...e,
        isNew: false
      }));
      await Promise.all([
        setRecentEarthquakes(normalized),
        setLastEventTime(newestTime)
      ]);
      return;
    }

    // 새로 감지된 지진들만 필터링
    const newEvents = events.filter(
      (e) => typeof e.time === "number" && e.time > lastEventTime
    );

    // 새 지진이 없으면, 최신 리스트만 업데이트 (isNew false)
    if (newEvents.length === 0) {
      const normalized = events.slice(0, 20).map((e) => ({
        ...e,
        isNew: false
      }));
      await setRecentEarthquakes(normalized);
      return;
    }

    // 새 지진이 있는 경우:
    // - 각 새 지진마다 알림을 띄운다.
    // - 최근 리스트를 업데이트하면서, 새 지진은 isNew: true로 표시한다.
    newEvents.forEach((quake) => {
      showEarthquakeNotification(quake);
    });

    const newestTime = events[0].time;

    // 최근 리스트 생성 (최대 20개 정도만 저장)
    const recentWithFlag = events.slice(0, 20).map((e) => ({
      ...e,
      // 새 지진 목록에 포함되면 isNew: true
      isNew: newEvents.some((n) => n.id === e.id)
    }));

    await Promise.all([
      setRecentEarthquakes(recentWithFlag),
      setLastEventTime(newestTime)
    ]);
  } catch (error) {
    // 에러가 발생하더라도 서비스 워커가 죽지 않도록 try/catch
    console.error("지진 데이터 확인 중 오류:", error);
  }
}

/**
 * 확장 프로그램이 설치되거나 업데이트될 때 알람을 세팅한다.
 */
chrome.runtime.onInstalled.addListener(() => {
  // 알람 생성: 주기적으로 EARTHQUAKE_ALARM_NAME 알람을 발생시킴
  chrome.alarms.create(EARTHQUAKE_ALARM_NAME, {
    periodInMinutes: POLLING_INTERVAL_MINUTES
  });

  // 설치 직후 한 번 즉시 체크
  checkForNewEarthquakes();
});

/**
 * 브라우저가 시작될 때(또는 서비스 워커가 다시 시작될 때) 알람이 없다면 다시 생성.
 */
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get(EARTHQUAKE_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(EARTHQUAKE_ALARM_NAME, {
        periodInMinutes: POLLING_INTERVAL_MINUTES
      });
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

// popup에서 강제로 새로고침 요청을 할 때를 대비한 메시지 처리
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

