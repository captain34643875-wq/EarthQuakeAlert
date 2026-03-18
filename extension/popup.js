﻿﻿// popup.js
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
 * 한국 시간 형식으로 변환하는 함수
 * @param {string} isoTime - ISO 시간 문자열
 * @returns {string} 한국 시간 형식
 */
function formatKoreanTime(isoTime) {
  const date = new Date(isoTime);
  return date.toLocaleString('ko-KR', { 
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 상대 시간을 계산하는 함수
 * @param {string} isoTime - ISO 시간 문자열
 * @returns {string} 상대 시간 (예: "10초 전", "2분 전")
 */
function getRelativeTime(isoTime) {
  const now = new Date();
  const quakeTime = new Date(isoTime);
  const diffMs = now - quakeTime;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return `${diffSecs}초 전`;
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${diffDays}일 전`;
}

/**
 * 복사 기능을 위한 유틸리티 함수
 * @param {string} text - 복사할 텍스트
 * @returns {Promise<boolean>} 성공 여부
 */
async function copyToClipboard(text) {
  try {
    // 클립보드 API가 지원되는지 확인
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // 대체 방법: document.execCommand 사용
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        document.body.removeChild(textArea);
        return true;
      } catch (fallbackError) {
        document.body.removeChild(textArea);
        console.error('대체 복사 방법 실패:', fallbackError);
        return false;
      }
    }
  } catch (error) {
    console.error('복사 실패:', error);
    return false;
  }
}

/**
 * 상태 텍스트를 갱신하는 헬퍼 함수
 * @param {string} text - 표시할 텍스트
 * @param {("normal"|"error")} [type="normal"] - 상태 유형 (일반/오류)
 */
function setStatusText(text, type = "normal") {
  const statusTextEl = document.getElementById("statusText");
  statusTextEl.innerHTML = text;
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
    
    // 규모별 색상 클래스 결정
    let magnitudeClass = '';
    if (typeof quake.magnitude === 'number') {
      if (quake.magnitude >= 6.0) magnitudeClass = 'magnitude-high';
      else if (quake.magnitude >= 4.0) magnitudeClass = 'magnitude-medium';
      else magnitudeClass = 'magnitude-low';
    }
    
    // 새 지진(isNew)이면 경고 스타일 적용
    itemEl.className = `quake-item ${magnitudeClass} ${quake.isNew ? "quake-item-new" : ""}`;

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
    placeEl.textContent = quake.location || quake.place || "위치 정보 없음";

    headerEl.appendChild(magEl);
    headerEl.appendChild(placeEl);

    // 상세 정보 영역 (시간, 깊이, 좌표 등)
    const detailsEl = document.createElement("div");
    detailsEl.className = "quake-details";

    const time = quake.time ? new Date(quake.time) : null;
    const timeStr = time ? formatKoreanTime(quake.time) : "알 수 없음";
    const relativeTimeStr = time ? getRelativeTime(quake.time) : "";

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
    timeLine.textContent = `발생 시각: ${timeStr}${relativeTimeStr ? ` (${relativeTimeStr})` : ''}`;

    const depthLine = document.createElement("div");
    depthLine.textContent = `깊이: ${depthStr}`;

    const coordLine = document.createElement("div");
    coordLine.textContent = `좌표(위도,경도): ${coordsStr}`;

    // 데이터 출처
    const sourceLine = document.createElement("div");
    sourceLine.textContent = `출처: ${quake.source || "알 수 없음"}`;

    detailsEl.appendChild(timeLine);
    detailsEl.appendChild(depthLine);
    detailsEl.appendChild(coordLine);
    detailsEl.appendChild(sourceLine);

    // (선택) 상세 페이지 링크 (USGS)
    if (quake.url) {
      const linkLine = document.createElement("div");
      const linkEl = document.createElement("a");
      linkEl.href = quake.url;
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
      linkEl.textContent = `상세 보기 (${quake.source || "출처"})`;
      linkEl.className = "quake-link";
      linkLine.appendChild(linkEl);
      detailsEl.appendChild(linkLine);
    }

    // 개별 복사 버튼
    const copyButton = document.createElement("button");
    copyButton.className = "quake-copy-button";
    copyButton.textContent = "복사";
    copyButton.addEventListener("click", async (e) => {
      e.stopPropagation(); // 이벤트 버블링 방지
      const success = await copyIndividualEarthquake(quake);
      if (success) {
        const originalText = copyButton.textContent;
        copyButton.textContent = "복사됨!";
        copyButton.classList.add("copied");
        setTimeout(() => {
          copyButton.textContent = originalText;
          copyButton.classList.remove("copied");
        }, 2000);
      }
    });
    detailsEl.appendChild(copyButton);

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
    // 오프라인 상태 확인
    if (!navigator.onLine) {
      setStatusText("오프라인 상태 - 마지막으로 저장된 데이터 표시 중...", "normal");
      const earthquakes = await getRecentEarthquakes();
      if (earthquakes && earthquakes.length > 0) {
        const newest = earthquakes[0];
        const quakeTimeStr = newest.time ? formatKoreanTime(newest.time) : "알 수 없음";
        const nowStr = formatKoreanTime(new Date().toISOString());
        setStatusText(`오프라인 - 마지막 업데이트: ${quakeTimeStr}<br>데이터 확인: ${nowStr} (캐시된 데이터)`);
        
        // 규모 필터링 적용
        const magnitudeFilter = document.getElementById("magnitudeFilter");
        const minMagnitude = parseFloat(magnitudeFilter.value) || 0;
        const filteredEarthquakes = filterByMagnitude(earthquakes, minMagnitude);
        
        renderEarthquakeList(filteredEarthquakes);
        return;
      }
    }

    setStatusText("데이터 불러오는 중...");
    const earthquakes = await getRecentEarthquakes();
    const nowStr = formatKoreanTime(new Date().toISOString());

    if (!earthquakes || earthquakes.length === 0) {
      setStatusText(`현재 발생한 지진은 없습니다.<br>데이터 확인: ${nowStr}`);
      renderEarthquakeList([]);
      return;
    }

    // 규모 필터링 적용
    const magnitudeFilter = document.getElementById("magnitudeFilter");
    const minMagnitude = parseFloat(magnitudeFilter.value) || 0;
    const filteredEarthquakes = filterByMagnitude(earthquakes, minMagnitude);

    if (filteredEarthquakes.length === 0) {
      setStatusText(`현재 발생한 지진은 없습니다. (필터: M${minMagnitude} 이상)<br>데이터 확인: ${nowStr}`);
      renderEarthquakeList([]);
      return;
    }

    // 가장 최신 이벤트의 시간과 현재 확인 시간을 표시
    const newest = filteredEarthquakes[0];
    const quakeTimeStr = newest.time ? formatKoreanTime(newest.time) : "알 수 없음";
    
    const filterText = minMagnitude > 0 ? ` (필터: M${minMagnitude} 이상)` : '';
    setStatusText(`최근 지진: ${quakeTimeStr}${filterText}<br>데이터 확인: ${nowStr}`);

    renderEarthquakeList(filteredEarthquakes);
  } catch (error) {
    console.error("지진 데이터 로드 중 오류:", error);
    setStatusText("데이터를 불러오는 중 오류가 발생했습니다.", "error");
  }
}

/**
 * 규모 필터링 적용
 * @param {Array} earthquakes - 전체 지진 데이터
 * @param {number} minMagnitude - 최소 규모
 * @returns {Array} 필터링된 지진 데이터
 */
function filterByMagnitude(earthquakes, minMagnitude) {
  if (!earthquakes || minMagnitude <= 0) {
    return earthquakes;
  }
  
  return earthquakes.filter(quake => 
    typeof quake.magnitude === 'number' && quake.magnitude >= minMagnitude
  );


/**
 * Estimate intensity (simple heuristic)
 * @param {number} magnitude
 * @returns {string}
 */
function estimateIntensity(magnitude) {
  if (typeof magnitude !== 'number') return '?';
  if (magnitude >= 6.0) return '\uC9C4\uB3C4 6 \uC774\uC0C1';
  if (magnitude >= 5.0) return '\uC9C4\uB3C4 5-6';
  if (magnitude >= 4.0) return '\uC9C4\uB3C4 4-5';
  if (magnitude >= 3.0) return '\uC9C4\uB3C4 3-4';
  return '\uC9C4\uB3C4 3 \uBBF8\uB9CC';
}
}

/**
 * 개별 지진 정보 복사
 * @param {Object} earthquake - 지진 정보 객체
 */
async function copyIndividualEarthquake(earthquake) {
  try {
    const location = earthquake.location || earthquake.place || '알 수 없는 위치';
    const magnitude = typeof earthquake.magnitude === 'number' ? earthquake.magnitude.toFixed(1) : '?';
    const intensity = estimateIntensity(earthquake.magnitude);

    const copyText = `[지진속보] 진원지: ${location} / 추정규모: ${magnitude} / 예상최대진도: ${intensity}`;
    
    return await copyToClipboard(copyText);
  } catch (error) {
    console.error('개별 복사 실패:', error);
    return false;
  }
}

/**
 * 지진 데이터를 지정된 형식으로 변환하여 복사
 * @param {Array} earthquakes - 지진 데이터 배열
 * @returns {string} 복사할 텍스트
 */
function formatEarthquakeForCopy(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return '[지진속보] 최근 지진 정보가 없습니다.';
  }
  
  const lines = earthquakes.map(quake => {
    const location = quake.location || quake.place || '알 수 없는 위치';
    const magnitude = typeof quake.magnitude === 'number' ? quake.magnitude.toFixed(1) : '?';
    const depth = typeof quake.depth === 'number' ? quake.depth.toFixed(1) : '?';
    
    // 예상최대진도는 규모를 기반으로 간단히 추정 (실제와 다를 수 있음)
    let intensity = '?';
    if (typeof quake.magnitude === 'number') {
      if (quake.magnitude >= 6.0) intensity = '진도 6 이상';
      else if (quake.magnitude >= 5.0) intensity = '진도 5-6';
      else if (quake.magnitude >= 4.0) intensity = '진도 4-5';
      else if (quake.magnitude >= 3.0) intensity = '진도 3-4';
      else intensity = '진도 3 미만';
    }
    
    return `[지진속보] 진원지: ${location} / 추정규모: ${magnitude} / 예상최대진도: ${intensity}`;
  });
  
  return lines.join('\n');
}

/**
 * 규모 필터링 설정
 */
function setupMagnitudeFilter() {
  const filter = document.getElementById("magnitudeFilter");
  filter.addEventListener("change", () => {
    loadAndRenderEarthquakes();
  });
}

/**
 * 복사 버튼 설정
 */
function setupCopyButton() {
  const btn = document.getElementById("copyAllButton");
  btn.addEventListener("click", async () => {
    try {
      const earthquakes = await getRecentEarthquakes();
      
      // 현재 필터링된 규모에 맞게 복사
      const magnitudeFilter = document.getElementById("magnitudeFilter");
      const minMagnitude = parseFloat(magnitudeFilter.value) || 0;
      const filteredEarthquakes = filterByMagnitude(earthquakes, minMagnitude);
      
      const copyText = formatEarthquakeForCopy(filteredEarthquakes);
      
      const success = await copyToClipboard(copyText);
      
      if (success) {
        // 버튼 상태 변경
        const originalText = btn.textContent;
        btn.textContent = '복사 완료!';
        btn.classList.add('copied');
        
        // 2초 후 원래 상태로 복귀
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } else {
        setStatusText('복사에 실패했습니다.', 'error');
      }
      
    } catch (error) {
      console.error('복사 실패:', error);
      setStatusText('복사에 실패했습니다.', 'error');
    }
  });
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
  setupMagnitudeFilter();
  setupCopyButton();
  loadAndRenderEarthquakes();
});

