/** 국내(한국) 여행지 이름. 여행지 칸에 이 이름이 있으면 국내여행으로 본다 */
const KOREAN_PLACES = [
  "서울", "부산", "제주", "서귀포", "우도", "인천", "대구", "대전", "광주", "울산", "세종",
  "경주", "강릉", "속초", "양양", "여수", "전주", "춘천", "통영", "거제", "남해", "포항", "안동",
  "수원", "가평", "양평", "평창", "정선", "단양", "군산", "목포", "순천", "담양", "보성", "보령", "태안",
  "강원", "경기", "경북", "경남", "전북", "전남", "충북", "충남", "대한민국", "한국",
  "korea", "seoul", "busan", "jeju",
];

/** 여행지가 한국 지명이면 true (쉼표·공백으로 나눈 단어 중 하나라도 한국 지명으로 시작하면) */
export function isKoreanDestination(destination: string): boolean {
  const words = destination.toLowerCase().split(/[,\s/·]+/).filter(Boolean);
  return words.length > 0 && words.some((w) => KOREAN_PLACES.some((p) => w.startsWith(p)));
}
