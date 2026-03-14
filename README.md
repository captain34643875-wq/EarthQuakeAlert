# EarthQuakeAlert

지진 속보 크롬 확장 프로그램입니다.  
전 세계(또는 한국 포함)에서 발생한 **최근 지진 정보를 주기적으로 확인**하고,  
새 지진이 감지되면 **브라우저 알림과 팝업 UI**로 알려줍니다.

## 주요 기능

- 최신 지진 정보 자동 수집 (USGS 공개 API 사용)
- 10~30초 간격(예: 약 15초)으로 지진 데이터 확인
- 새 지진 발생 시 **Chrome Notification API**를 이용해 알림 표시
- `popup.html`에서 최근 지진 목록을 카드 형태로 표시
- 지진 정보 항목
  - 위치
  - 규모(Magnitude)
  - 깊이(Depth, km)
  - 발생 시간
- 새로 감지된 지진은 **빨간색 경고 UI**로 강조 표시

## 폴더 / 파일 구조

```text
extension/
├─ manifest.json     # Chrome Extension Manifest V3 설정
├─ background.js     # 서비스 워커: 주기적인 지진 데이터 확인 및 알림 발송
├─ popup.html        # 확장 아이콘 클릭 시 표시되는 팝업 UI
├─ popup.js          # 팝업에서 최근 지진 목록 렌더링 및 새로고침 로직
└─ style.css         # 팝업 UI 스타일 (단순하지만 깔끔한 카드형 디자인)
```

## 사용한 지진 API

- **USGS (미국 지질조사국) 공개 API**
  - URL 예시:  
    `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson`
  - 최근 1시간 동안 전 세계에서 발생한 지진 데이터를 **무료로** 제공
  - 응답 형식은 GeoJSON이며, `features` 배열에 각 지진 이벤트가 포함됩니다.

## 설치 및 실행 방법 (Chrome 확장)

1. 이 저장소를 클론하거나 ZIP으로 다운로드 후 압축을 풉니다.
2. `extension` 폴더 안에 다음 파일들이 있는지 확인합니다.
   - `manifest.json`
   - `background.js`
   - `popup.html`
   - `popup.js`
   - `style.css`
3. Chrome 주소창에 `chrome://extensions/` 를 입력해 확장 프로그램 관리 페이지를 엽니다.
4. 오른쪽 상단의 **개발자 모드**를 켭니다.
5. **[압축 해제된 확장 프로그램을 로드]** 버튼을 눌러, 이 프로젝트의 `extension` 폴더를 선택합니다.
6. 확장 프로그램이 목록에 추가되면, 툴바의 확장 아이콘(퍼즐 모양) → `EarthQuakeAlert`를 **고정(핀)** 해서 쉽게 접근할 수 있습니다.
7. 아이콘을 클릭하면 `popup.html` 이 열리며, 최근 지진 목록이 카드 형태로 표시됩니다.

## 동작 방식 개요

- `background.js`
  - Chrome **알람(alarms)** 기능을 이용해 약 15초마다 지진 API를 호출합니다.
  - 새 지진이 발견되면, Chrome **알림(notifications)** 으로 사용자에게 알려줍니다.
  - 최근 지진 목록과 마지막으로 확인한 지진 시간을 `chrome.storage.local` 에 저장하여,  
    팝업에서 데이터를 바로 읽을 수 있도록 합니다.

- `popup.js` + `popup.html` + `style.css`
  - 팝업이 열릴 때 `chrome.storage.local` 에서 최근 지진 목록을 읽어와 화면에 렌더링합니다.
  - `isNew` 플래그가 `true` 인 지진은 **빨간색 테두리 · 배경**으로 경고 스타일을 적용합니다.
  - 상단의 **새로 고침** 버튼을 누르면, `background.js` 에 메시지를 보내 즉시 데이터를 다시 확인하도록 요청합니다.

## 주의 사항 및 확장 아이디어

- Chrome Web Store에 실제 배포 시에는 **폴링 간격**을 너무 짧게 설정하지 않는 것이 좋습니다.
- 한국 인근만 별도 필터링하거나, 규모(M) 기준으로 필터/정렬 기능을 추가할 수 있습니다.
- 알림/경고가 너무 잦을 경우, 규모 임계값(예: M 3.0 이상만 알림)을 설정하는 것도 가능합니다.
