import { refitDay } from "@/lib/dayBalance";
import { item, linearDay } from "./fixtures";

/** 회귀 시나리오 — 실제로 올라온 상품 모양을 본뜬 일정 (자동 기능이 새 불가능 시간을 만들지 않는지 본다) */

// 파타야·방콕 4박6일 모양 — DAY 1은 밤 비행기로 새벽 2시 도착
export const pattayaTrip = () =>
  [
    linearDay(1, [
      item("dep", { type: "flight", name: "김해 국제공항 출발", fixedTime: "20:30", stayMinutes: 0, travelMinutesToNext: 330 }),
      item("arr", { type: "flight", name: "방콕 수안나품 공항 도착", stayMinutes: 40, travelMinutesToNext: 100 }),
      item("tr", { type: "transfer", name: "호텔로 이동", stayMinutes: 0, travelMinutesToNext: 0 }),
      item("h1", { type: "hotel", name: "호텔 새벽 체크인", stayMinutes: 0 }),
    ], { overnightCity: "파타야" }),
    linearDay(2, [
      item("pool", { type: "free_time", name: "오전 자유시간", description: "호텔 수영장", stayMinutes: 150, travelMinutesToNext: 20 }),
      item("l2", { type: "meal", name: "중식 (닭갈비 정식)", stayMinutes: 60, travelMinutesToNext: 30 }),
      item("nong", { type: "experience", name: "농눗빌리지", stayMinutes: 120, travelMinutesToNext: 40 }),
      item("d2", { type: "meal", name: "석식 (씨푸드 뷔페)", stayMinutes: 80, travelMinutesToNext: 20 }),
      item("nm", { type: "shopping", name: "파타야 야시장", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("h2", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ], { overnightCity: "파타야" }),
    linearDay(3, [
      item("hop", { type: "experience", name: "산호섬 호핑 투어", stayMinutes: 180, travelMinutesToNext: 0 }),
      item("act", { type: "experience", name: "해양 엑티비티", stayMinutes: 50, travelMinutesToNext: 20 }),
      item("l3", { type: "meal", name: "중식 (무제한 삼겹살)", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("temple", { name: "진리의 성전", admission: "enter", stayMinutes: 80, travelMinutesToNext: 20 }),
      item("mas", { type: "massage", name: "태국 전통마사지", stayMinutes: 120, travelMinutesToNext: 20 }),
      item("d3", { type: "meal", name: "석식 (서프앤터프)", stayMinutes: 70, travelMinutesToNext: 20 }),
      item("h3", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ], { overnightCity: "파타야", meetingTime: "09:00" }),
    linearDay(4, [
      item("mv", { type: "transfer", name: "방콕으로 이동", stayMinutes: 150, travelMinutesToNext: 10 }),
      item("l4", { type: "meal", name: "중식 (끈적국수)", stayMinutes: 50, travelMinutesToNext: 20 }),
      item("palace", { name: "왕궁·에메랄드 사원", admission: "enter", stayMinutes: 180, travelMinutesToNext: 30 }),
      item("asia", { type: "shopping", name: "아시아티크", stayMinutes: 90, travelMinutesToNext: 10 }),
      item("d4", { type: "meal", name: "석식 (선상디너 크루즈)", stayMinutes: 90, travelMinutesToNext: 20, fixedTime: "19:30" }),
      item("h4", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ], { overnightCity: "방콕", meetingTime: "09:00" }),
    linearDay(5, [
      item("mk", { name: "매끌렁 기찻길 시장", admission: "view_only", stayMinutes: 60, travelMinutesToNext: 70 }),
      item("l5", { type: "meal", name: "중식 (현지식)", stayMinutes: 60, travelMinutesToNext: 60 }),
      item("mas5", { type: "massage", name: "태국 전통마사지", stayMinutes: 120, travelMinutesToNext: 20 }),
      item("d5", { type: "meal", name: "석식 (MK수끼)", stayMinutes: 70, travelMinutesToNext: 40 }),
      item("tr5", { type: "transfer", name: "공항으로 이동", stayMinutes: 0, travelMinutesToNext: 40 }),
      item("out", { type: "flight", name: "방콕 출발", fixedTime: "23:50", stayMinutes: 0, travelMinutesToNext: 300 }),
    ], { overnightCity: "", meetingTime: "09:00", hotelLeadMinutes: 70 }),
    linearDay(6, [item("in", { type: "flight", name: "김해 국제공항 도착 후 해산", stayMinutes: 0 })], { overnightCity: "" }),
  ].map(refitDay);

// 다낭 3박5일 모양 — DAY 1은 오전 도착, 마지막 날 새벽 귀국 항공
export const danangTrip = () =>
  [
    linearDay(1, [
      item("dep", { type: "flight", name: "인천 출발", fixedTime: "07:00", stayMinutes: 0, travelMinutesToNext: 290 }),
      item("arr", { type: "flight", name: "다낭 공항 도착", stayMinutes: 30, travelMinutesToNext: 30 }),
      item("l1", { type: "meal", name: "중식 (쌀국수)", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("cathedral", { name: "다낭 대성당", admission: "view_only", stayMinutes: 30, travelMinutesToNext: 20 }),
      item("hanmarket", { type: "shopping", name: "한 시장", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("d1", { type: "meal", name: "석식 (해산물)", stayMinutes: 70, travelMinutesToNext: 20 }),
      item("h1", { type: "hotel", name: "호텔 체크인", stayMinutes: 0 }),
    ], { overnightCity: "다낭" }),
    linearDay(2, [
      item("bana", { name: "바나힐 골든브릿지", admission: "enter", stayMinutes: 240, travelMinutesToNext: 20 }),
      item("l2", { type: "meal", name: "중식 (뷔페)", stayMinutes: 60, travelMinutesToNext: 50 }),
      item("marble", { name: "오행산", admission: "enter", stayMinutes: 90, travelMinutesToNext: 30 }),
      item("d2", { type: "meal", name: "석식 (현지식)", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("dragon", { name: "용다리 불쇼", admission: "view_only", stayMinutes: 30, travelMinutesToNext: 20, fixedTime: "21:00" }),
      item("h2", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ], { overnightCity: "다낭", meetingTime: "08:30" }),
    linearDay(3, [
      item("hoian", { name: "호이안 올드타운", admission: "enter", stayMinutes: 150, travelMinutesToNext: 20 }),
      item("l3", { type: "meal", name: "중식 (까오러우)", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("basket", { type: "experience", name: "바구니배 체험", stayMinutes: 60, travelMinutesToNext: 30 }),
      item("mas", { type: "massage", name: "전신 마사지", stayMinutes: 90, travelMinutesToNext: 20 }),
      item("d3", { type: "meal", name: "석식 (한식)", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("night", { type: "shopping", name: "호이안 야시장", stayMinutes: 60, travelMinutesToNext: 40 }),
      item("h3", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ], { overnightCity: "다낭", meetingTime: "09:00" }),
    linearDay(4, [
      item("myk", { name: "미케 비치", admission: "view_only", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("l4", { type: "meal", name: "중식 (분짜)", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("free4", { type: "free_time", name: "자유시간", stayMinutes: 180, travelMinutesToNext: 20 }),
      item("d4", { type: "meal", name: "석식 (스테이크)", stayMinutes: 70, travelMinutesToNext: 30 }),
      item("tr4", { type: "transfer", name: "공항으로 이동", stayMinutes: 0, travelMinutesToNext: 30 }),
      item("out", { type: "flight", name: "다낭 출발", fixedTime: "23:55", stayMinutes: 0, travelMinutesToNext: 270 }),
    ], { overnightCity: "", meetingTime: "10:00" }),
    linearDay(5, [item("in", { type: "flight", name: "인천 도착", stayMinutes: 0 })], { overnightCity: "" }),
  ].map(refitDay);

// 마카오 2박3일 모양 — 오후 도착, 월요일 휴관 박물관, 저녁 출국
export const macauTrip = () =>
  [
    linearDay(1, [
      item("arr", { type: "flight", name: "마카오 공항 도착", fixedTime: "13:00", stayMinutes: 40, travelMinutesToNext: 30 }),
      item("h1a", { type: "hotel", name: "호텔 체크인", stayMinutes: 30, travelMinutesToNext: 20 }),
      item("senado", { name: "세나도 광장", admission: "view_only", stayMinutes: 60, travelMinutesToNext: 10 }),
      item("ruins", { name: "성 바울 성당 유적", admission: "view_only", stayMinutes: 40, travelMinutesToNext: 20 }),
      item("d1", { type: "meal", name: "석식 (매캐니즈)", stayMinutes: 70, travelMinutesToNext: 20 }),
      item("h1", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ], { overnightCity: "마카오" }),
    linearDay(2, [
      item("museum", { name: "마카오 박물관", admission: "enter", stayMinutes: 90, travelMinutesToNext: 20, openHours: { mon: "closed", tue: "10:00-18:00", wed: "10:00-18:00" } }),
      item("l2", { type: "meal", name: "중식 (딤섬)", stayMinutes: 60, travelMinutesToNext: 20 }),
      item("tower", { name: "마카오 타워", admission: "enter", stayMinutes: 90, travelMinutesToNext: 30 }),
      item("coloane", { name: "콜로안 빌리지", admission: "view_only", stayMinutes: 60, travelMinutesToNext: 30 }),
      item("d2", { type: "meal", name: "석식 (포르투갈식)", stayMinutes: 80, travelMinutesToNext: 20 }),
      item("fount", { name: "윈 팰리스 분수쇼", admission: "view_only", stayMinutes: 30, travelMinutesToNext: 20, fixedTime: "20:00" }),
      item("h2", { type: "hotel", name: "호텔 투숙", stayMinutes: 0 }),
    ], { overnightCity: "마카오", meetingTime: "09:30" }),
    linearDay(3, [
      item("taipa", { name: "타이파 빌리지", admission: "view_only", stayMinutes: 90, travelMinutesToNext: 20 }),
      item("l3", { type: "meal", name: "중식 (에그타르트·현지식)", stayMinutes: 60, travelMinutesToNext: 30 }),
      item("tr3", { type: "transfer", name: "공항으로 이동", stayMinutes: 0, travelMinutesToNext: 20 }),
      item("out", { type: "flight", name: "마카오 출발", fixedTime: "18:30", stayMinutes: 0, travelMinutesToNext: 180 }),
    ], { overnightCity: "", meetingTime: "09:30" }),
  ].map(refitDay);
