import type { SetupSection } from "@/lib/setupChecklist";

/** 입력 폴더 안의 세부 항목. 견적 경고·진행 상황 등 다른 곳에서 이 항목으로 바로 이동시킬 때 쓴다 */
export type SettingsSection = SetupSection;

export interface SettingsFocus {
  section: SettingsSection;
  /** 같은 항목을 다시 눌러도 이동하도록 매번 바뀌는 값 */
  n: number;
}

/** 세부 항목이 들어 있는 입력 폴더 (폴더 번호) */
export const FOLDER_OF: Record<SettingsSection, 3 | 4 | 5 | 6> = {
  pricing: 3,
  cost: 4,
  package: 4,
  documents: 5,
  channels: 6,
  competitors: 6,
};
