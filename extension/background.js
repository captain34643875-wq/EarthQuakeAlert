/**
 * background.js
 * Manifest V3 service worker
 */

importScripts('earthquakeService.js');

const EARTHQUAKE_ALARM_NAME = "EARTHQUAKE_POLLING_ALARM";
const POLLING_INTERVAL_MINUTES = 2;

const STORAGE_KEYS = {
  LAST_EVENT_TIME: "lastEventTime",
  RECENT_EARTHQUAKES: "recentEarthquakes"
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
    const lastEventTime = await getLastEventTime();

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
      }
      return;
    }

    const newEvents = recentEarthquakes.filter(
      (e) => e.time && new Date(e.time) > new Date(lastEventTime)
    );

    if (newEvents.length === 0) {
      const normalized = recentEarthquakes.slice(0, 20).map((e) => ({
        ...e,
        isNew: false
      }));
      await setRecentEarthquakes(normalized);
      return;
    }

    newEvents.forEach((quake) => {
      showEarthquakeNotification(quake);
    });

    const newestTime = recentEarthquakes[0].time;
    const recentWithFlag = recentEarthquakes.slice(0, 20).map((e) => ({
      ...e,
      isNew: newEvents.some((n) => n.id === e.id)
    }));

    await Promise.all([
      setRecentEarthquakes(recentWithFlag),
      setLastEventTime(newestTime)
    ]);
  } catch (error) {
    console.error("Earthquake check error:", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(EARTHQUAKE_ALARM_NAME, {
    periodInMinutes: POLLING_INTERVAL_MINUTES
  });

  checkForNewEarthquakes();
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
