/**
 * earthquakeService.js
 * 여러 기관의 지진 데이터를 수집하고 중복을 제거하는 서비스
 * - USGS (전 세계 지진)
 * - Korea Meteorological Administration (한국 지진)  
 * - Japan Meteorological Agency (일본 지진)
 * - EMSC (유럽 및 지중해 지진)
 */

// 각 기관별 API 엔드포인트
const API_ENDPOINTS = {
  // USGS - 최근 1시간 전 세계 지진 (GeoJSON 형식)
  USGS: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
  
  // 한국 기상청 - 실시간 지진 목록 (XML 형식)
  // 참고: 실제 API 키가 필요할 수 있음, 예제에서는 공개 데이터 사용
  KMA: "https://api.weather.go.kr/weather/earthquake/list?type=xml",
  
  // 일본 기상청 - 최근 지진 정보 (JSON 형식)
  JMA: "https://www.jma.go.jp/bosai/quake/data/list.json",
  
  // EMSC - 최근 지진 정보 (JSON 형식)  
  EMSC: "https://www.emsc-csem.org/service/api/query?fmt=json&minmag=2.0"
};

/**
 * 공통 지진 데이터 구조로 변환
 * @param {Object} rawData - 원본 지진 데이터
 * @param {string} source - 데이터 출처 (USGS, KMA, JMA, EMSC)
 * @returns {Object} 표준화된 지진 데이터
 */
function normalizeEarthquakeData(rawData, source) {
  try {
    switch (source) {
      case 'USGS':
        return normalizeUSGSData(rawData);
      case 'KMA':
        return normalizeKMAData(rawData);
      case 'JMA':
        return normalizeJMAData(rawData);
      case 'EMSC':
        return normalizeEMSCData(rawData);
      default:
        return null;
    }
  } catch (error) {
    console.error(`${source} 데이터 정규화 오류:`, error);
    return null;
  }
}

/**
 * USGS 데이터 정규화
 * USGS GeoJSON 형식을 공통 구조로 변환
 */
function normalizeUSGSData(data) {
  if (!data.features || !Array.isArray(data.features)) {
    return [];
  }
  
  return data.features.map(feature => {
    const props = feature.properties || {};
    const geom = feature.geometry || {};
    const coords = geom.coordinates || [];
    
    return {
      location: props.place || 'Unknown Location',
      magnitude: props.mag || 0,
      depth: coords[2] || 0,
      time: new Date(props.time).toISOString(),
      source: 'USGS',
      id: `USGS_${feature.id}`,
      latitude: coords[1],
      longitude: coords[0],
      url: props.url
    };
  });
}

/**
 * 한국 기상청 데이터 정규화
 * KMA XML 형식을 공통 구조로 변환
 */
function normalizeKMAData(data) {
  // KMA 데이터는 XML 형식이므로 파싱 필요
  // 여기서는 예제 데이터 구조로 가정
  if (!data.earthquakeInfo || !data.earthquakeInfo.earthquake) {
    return [];
  }
  
  const earthquakes = Array.isArray(data.earthquakeInfo.earthquake) 
    ? data.earthquakeInfo.earthquake 
    : [data.earthquakeInfo.earthquake];
    
  return earthquakes.map(eq => ({
    location: eq.location || eq.addr || 'Unknown',
    magnitude: parseFloat(eq.mag) || 0,
    depth: parseFloat(eq.depth) || 0,
    time: new Date(eq.occurTime || eq.time).toISOString(),
    source: 'KMA',
    id: `KMA_${eq.eqId || Date.now()}`,
    latitude: parseFloat(eq.lat) || 0,
    longitude: parseFloat(eq.lon) || 0
  }));
}

/**
 * 일본 기상청 데이터 정규화
 * JMA JSON 형식을 공통 구조로 변환
 */
function normalizeJMAData(data) {
  if (!data || !Array.isArray(data)) {
    return [];
  }
  
  return data.map(item => {
    const earthquake = item.earthquake || {};
    const hypocenter = earthquake.hypocenter || {};
    
    return {
      location: hypocenter.name || hypocenter.area || 'Unknown',
      magnitude: earthquake.magnitude?.value || 0,
      depth: hypocenter.depth || 0,
      time: new Date(earthquake.time || earthquake.datetime).toISOString(),
      source: 'JMA',
      id: `JMA_${item.id || Date.now()}`,
      latitude: hypocenter.latitude || 0,
      longitude: hypocenter.longitude || 0
    };
  });
}

/**
 * EMSC 데이터 정규화
 * EMSC JSON 형식을 공통 구조로 변환
 */
function normalizeEMSCData(data) {
  if (!data || !data.earthquakes || !Array.isArray(data.earthquakes)) {
    return [];
  }
  
  return data.earthquakes.map(eq => ({
    location: eq.place || eq.region || 'Unknown',
    magnitude: eq.magnitude || eq.mag || 0,
    depth: eq.depth || 0,
    time: new Date(eq.time || eq.datetime).toISOString(),
    source: 'EMSC',
    id: `EMSC_${eq.id || eq.source_id || Date.now()}`,
    latitude: eq.lat || eq.latitude || 0,
    longitude: eq.lon || eq.longitude || 0
  }));
}

/**
 * 지진 데이터 중복 제거
 * 시간, 위치, 규모가 비슷하면 같은 이벤트로 처리
 * @param {Array} earthquakes - 지진 데이터 배열
 * @returns {Array} 중복이 제거된 지진 배열
 */
function removeDuplicateEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }
  
  // 시간순으로 정렬 (최신순)
  const sorted = [...earthquakes].sort((a, b) => 
    new Date(b.time) - new Date(a.time)
  );
  
  const unique = [];
  const seen = new Set();
  
  for (const earthquake of sorted) {
    // 중복 확인을 위한 키 생성
    // 시간 차이 (5분 이내), 위치 유사성 (1도 이내), 규모 유사성 (0.5 이내)
    const duplicateKey = sorted.filter(existing => {
      if (existing.id === earthquake.id) return true;
      
      const timeDiff = Math.abs(
        new Date(existing.time) - new Date(earthquake.time)
      ) / (1000 * 60); // 분 단위
      
      const latDiff = Math.abs(existing.latitude - earthquake.latitude);
      const lonDiff = Math.abs(existing.longitude - earthquake.longitude);
      const magDiff = Math.abs(existing.magnitude - earthquake.magnitude);
      
      // 중복 기준: 5분 이내, 1도 이내 위치, 0.5 이내 규모 차이
      return timeDiff <= 5 && latDiff <= 1 && lonDiff <= 1 && magDiff <= 0.5;
    });
    
    // 중복이 아니면 추가
    if (!duplicateKey.some(existing => unique.includes(existing))) {
      unique.push(earthquake);
    }
  }
  
  return unique;
}

/**
 * 특정 기관의 지진 데이터 가져오기
 * @param {string} source - 데이터 출처 (USGS, KMA, JMA, EMSC)
 * @returns {Promise<Array>} 정규화된 지진 데이터 배열
 */
async function fetchEarthquakeData(source) {
  try {
    const url = API_ENDPOINTS[source];
    if (!url) {
      throw new Error(`지원되지 않는 데이터 출처: ${source}`);
    }
    
    console.log(`${source}에서 지진 데이터 가져오는 중...`);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`${source} API 요청 실패: ${response.status}`);
    }
    
    const data = await response.json();
    const normalized = normalizeEarthquakeData(data, source);
    
    console.log(`${source}에서 ${normalized.length}개 지진 데이터 가져옴`);
    return normalized;
    
  } catch (error) {
    console.error(`${source} 데이터 가져오기 오류:`, error);
    return [];
  }
}

/**
 * 모든 기관에서 지진 데이터 가져오기
 * @returns {Promise<Array>} 통합된 지진 데이터 배열
 */
async function fetchAllEarthquakeData() {
  try {
    // 모든 기관에서 병렬로 데이터 가져오기
    const sources = ['USGS', 'KMA', 'JMA', 'EMSC'];
    const promises = sources.map(source => fetchEarthquakeData(source));
    
    const results = await Promise.allSettled(promises);
    const allEarthquakes = [];
    
    results.forEach((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') {
        allEarthquakes.push(...result.value);
      } else {
        console.error(`${source} 데이터 가져오기 실패:`, result.reason);
      }
    });
    
    // 중복 제거
    const uniqueEarthquakes = removeDuplicateEarthquakes(allEarthquakes);
    
    // 최신순으로 정렬
    uniqueEarthquakes.sort((a, b) => 
      new Date(b.time) - new Date(a.time)
    );
    
    console.log(`총 ${uniqueEarthquakes.length}개의 고유한 지진 데이터 수집 완료`);
    return uniqueEarthquakes;
    
  } catch (error) {
    console.error('지진 데이터 수집 중 오류:', error);
    return [];
  }
}

/**
 * 최근 지진 데이터만 필터링 (최근 24시간)
 * @param {Array} earthquakes - 지진 데이터 배열
 * @returns {Array} 최근 지진 데이터 배열
 */
function filterRecentEarthquakes(earthquakes) {
  if (!earthquakes || earthquakes.length === 0) {
    return [];
  }
  
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return earthquakes.filter(eq => 
    new Date(eq.time) >= oneDayAgo
  );
}

// 전역으로 내보내기
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
} else if (typeof self !== 'undefined') {
  // Service Worker 환경
  self.EarthquakeService = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
} else {
  // 일반 브라우저 환경
  window.EarthquakeService = {
    fetchAllEarthquakeData,
    fetchEarthquakeData,
    removeDuplicateEarthquakes,
    normalizeEarthquakeData,
    filterRecentEarthquakes
  };
}
