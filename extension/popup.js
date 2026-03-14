// popup.js
// - popup.html이 열릴 때 chrome.storage.local에 저장된 최근 지진 리스트를 읽어와 화면에 표시한다.
// - 새로 고침 버튼을 누르면 background 서비스 워커에 메시지를 보내 즉시 갱신을 요청한다.
// - isNew 플래그가 true인 지진은 빨간 경고 스타일로 강조한다.

const STORAGE_KEYS = {
  RECENT_EARTHQUAKES: "recentEarthquakes"
};

/**
 * chrome.storage.local에서 최근 지진 리스트를 가져오는 함수
 * @returns {Promise<Array>}
 */
function getRecentEarthquakes() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEYS.RECENT_EARTHQUAKES, (result) => {
      if (
        result &&
        Object.prototype.hasOwnProperty.call(
          result,
          STORAGE_KEYS.RECENT_EARTHQUAKES
        )
      ) {
        resolve(result[STORAGE_KEYS.RECENT_EARTHQUAKES] || []);
      } else {
        resolve([]);
      }
    });
  });
}

/**
 * 상태 텍스트를 갱신하는 헬퍼 함수
 * @param {string} text - 표시할 텍스트
 * @param {("normal"|"error")} [type="normal"] - 상태 유형 (일반/오류)
 */
function setStatusText(text, type = "normal") {
  const statusTextEl = document.getElementById("statusText");
  statusTextEl.textContent = text;
  statusTextEl.classList.toggle("status-error", type === "error");
}

/**
 * 지진 리스트를 HTML에 렌더링한다.
 * @param {Array} earthquakes
 */
function renderEarthquakeList(earthquakes) {
  const listEl = document.getElementById("earthquakeList");
  listEl.innerHTML = ""; // 기존 내용 비우기

  if (!earthquakes || earthquakes.length === 0) {
    // 표시할 지진이 없는 경우
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-item";
    emptyItem.textContent = "표시할 지진 정보가 없습니다.";
    listEl.appendChild(emptyItem);
    return;
  }

  earthquakes.forEach((quake) => {
    const itemEl = document.createElement("li");
    // 새 지진(isNew)이면 경고 스타일 적용
    itemEl.className = `quake-item ${quake.isNew ? "quake-item-new" : ""}`;

    const headerEl = document.createElement("div");
    headerEl.className = "quake-header";

    // 규모 (Magnitude)
    const magEl = document.createElement("span");
    magEl.className = "quake-mag";
    magEl.textContent =
      typeof quake.magnitude === "number"
        ? `M ${quake.magnitude.toFixed(1)}`
        : "M ?";

    // 위치 텍스트
    const placeEl = document.createElement("span");
    placeEl.className = "quake-place";
    placeEl.textContent = quake.place || "위치 정보 없음";

    headerEl.appendChild(magEl);
    headerEl.appendChild(placeEl);

    // 상세 정보 영역 (시간, 깊이, 좌표 등)
    const detailsEl = document.createElement("div");
    detailsEl.className = "quake-details";

    const time = quake.time ? new Date(quake.time) : null;
    const timeStr = time ? time.toLocaleString() : "알 수 없음";

    const depthStr =
      typeof quake.depth === "number"
        ? `${quake.depth.toFixed(1)} km`
        : "알 수 없음";

    const coordsStr =
      typeof quake.latitude === "number" &&
      typeof quake.longitude === "number"
        ? `${quake.latitude.toFixed(2)}, ${quake.longitude.toFixed(2)}`
        : "알 수 없음";

    // 각 정보는 한 줄씩 표시
    const timeLine = document.createElement("div");
    timeLine.textContent = `발생 시각: ${timeStr}`;

    const depthLine = document.createElement("div");
    depthLine.textContent = `깊이: ${depthStr}`;

    const coordLine = document.createElement("div");
    coordLine.textContent = `좌표(위도,경도): ${coordsStr}`;

    detailsEl.appendChild(timeLine);
    detailsEl.appendChild(depthLine);
    detailsEl.appendChild(coordLine);

    // (선택) 상세 페이지 링크 (USGS)
    if (quake.url) {
      const linkLine = document.createElement("div");
      const linkEl = document.createElement("a");
      linkEl.href = quake.url;
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
      linkEl.textContent = "상세 보기 (USGS)";
      linkEl.className = "quake-link";
      linkLine.appendChild(linkEl);
      detailsEl.appendChild(linkLine);
    }

    itemEl.appendChild(headerEl);
    itemEl.appendChild(detailsEl);

    listEl.appendChild(itemEl);
  });
}

/**
 * 최근 지진 데이터를 읽어와 렌더링하는 메인 함수
 */
async function loadAndRenderEarthquakes() {
  try {
    setStatusText("데이터 불러오는 중...");
    const earthquakes = await getRecentEarthquakes();

    if (!earthquakes || earthquakes.length === 0) {
      setStatusText("최근 1시간 이내 지진 정보가 없습니다.");
    } else {
      // 가장 최신 이벤트의 시간을 상태 영역에 표시
      const newest = earthquakes[0];
      const time = newest.time ? new Date(newest.time) : null;
      const timeStr = time ? time.toLocaleString() : "알 수 없음";
      setStatusText(`최근 업데이트 기준: ${timeStr}`);
    }

    renderEarthquakeList(earthquakes);
  } catch (error) {
    console.error("지진 데이터 로드 중 오류:", error);
    setStatusText("데이터를 불러오는 중 오류가 발생했습니다.", "error");
  }
}

/**
 * 새로 고침 버튼 클릭 시 background 서비스 워커에
 * "지금 바로 지진 데이터 다시 확인" 요청을 보내는 함수
 */
function setupRefreshButton() {
  const btn = document.getElementById("refreshButton");
  btn.addEventListener("click", () => {
    setStatusText("즉시 갱신 중...");
    chrome.runtime.sendMessage(
      { type: "FORCE_REFRESH_EARTHQUAKES" },
      () => {
        // background에서 응답이 온 뒤 다시 로딩
        loadAndRenderEarthquakes();
      }
    );
  });
}

// DOM이 준비되면 이벤트 바인딩 및 데이터 로드 실행
document.addEventListener("DOMContentLoaded", () => {
  setupRefreshButton();
  loadAndRenderEarthquakes();
});

