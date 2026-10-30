import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GraduationCap, LoaderCircle } from "lucide-react";
import { citiesOf, loadUniversities, schoolsOf, type UniversityIndex } from "../lib/universities";
import type { Profile } from "../lib/profile";

// 专业不适合做下拉（本科专业 800+），这里给一份常见专业的建议列表，
// 用户可以直接选，也可以自己敲——输入框始终是自由文本。
const MAJOR_HINTS = [
  "计算机科学与技术", "软件工程", "人工智能", "数据科学与大数据技术", "网络空间安全",
  "电子信息工程", "通信工程", "自动化", "电气工程及其自动化", "微电子科学与工程",
  "机械设计制造及其自动化", "车辆工程", "土木工程", "建筑学", "材料科学与工程",
  "能源与动力工程", "环境科学", "化学", "应用化学", "生物科学", "生物医学工程",
  "数学与应用数学", "统计学", "物理学", "经济学", "金融学", "会计学", "工商管理",
  "市场营销", "国际经济与贸易", "财政学", "法学", "行政管理", "社会学", "政治学与行政学",
  "新闻学", "传播学", "汉语言文学", "英语", "日语", "历史学", "哲学", "教育学", "心理学",
  "临床医学", "口腔医学", "药学", "护理学", "公共卫生与预防医学", "农学", "园艺学",
  "艺术设计学", "视觉传达设计", "音乐学", "体育教育",
];

type Props = {
  open: boolean;
  initial: Profile | null;
  onSkip: () => void;
  onSubmit: (profile: Profile) => void;
};

export default function ProfileGate({ open, initial, onSkip, onSubmit }: Props) {
  const [index, setIndex] = useState<UniversityIndex | null>(null);
  const [province, setProvince] = useState(initial?.province ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [school, setSchool] = useState(initial?.school ?? "");
  const [major, setMajor] = useState(initial?.major ?? "");

  useEffect(() => {
    if (!open || index) return;
    let alive = true;
    loadUniversities().then((data) => {
      if (alive) setIndex(data);
    });
    return () => {
      alive = false;
    };
  }, [open, index]);

  const provinces = useMemo(() => (index ? Object.keys(index).sort((a, b) => a.localeCompare(b, "zh")) : []), [index]);
  const cities = useMemo(() => (index && province ? citiesOf(index, province) : []), [index, province]);
  const schools = useMemo(
    () => (index && province && city ? schoolsOf(index, province, city) : []),
    [index, province, city],
  );

  if (!open) return null;

  const ready = Boolean(province && city && school);

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true" aria-labelledby="gate-title">
      <div className="gate-card">
        <div className="gate-head">
          <span className="gate-icon"><GraduationCap size={20} /></span>
          <div>
            <h2 id="gate-title">先认识一下你</h2>
            <p>知道你在哪个学校、读什么专业，讲解的侧重点和示例就能更贴着你来。</p>
          </div>
        </div>

        {!index ? (
          <div className="gate-loading"><LoaderCircle size={16} className="spin" />正在加载院校名单…</div>
        ) : (
          <div className="gate-fields">
            <label>
              <span>省份 / 直辖市</span>
              <select
                value={province}
                onChange={(event) => {
                  setProvince(event.target.value);
                  setCity("");
                  setSchool("");
                }}
              >
                <option value="">请选择</option>
                {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label>
              <span>城市</span>
              <select
                value={city}
                disabled={!province}
                onChange={(event) => {
                  setCity(event.target.value);
                  setSchool("");
                }}
              >
                <option value="">{province ? "请选择" : "先选省份"}</option>
                {cities.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label className="gate-wide">
              <span>学校</span>
              <select value={school} disabled={!city} onChange={(event) => setSchool(event.target.value)}>
                <option value="">{city ? (schools.length ? "请选择" : "这个城市没有收录学校，可直接填写") : "先选城市"}</option>
                {schools.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label className="gate-wide">
              <span>专业 <small>选填</small></span>
              <input
                list="major-hints"
                value={major}
                onChange={(event) => setMajor(event.target.value)}
                placeholder="如：经济学 / 计算机科学与技术"
                autoComplete="off"
              />
              <datalist id="major-hints">
                {MAJOR_HINTS.map((item) => <option key={item} value={item} />)}
              </datalist>
            </label>
          </div>
        )}

        <p className="gate-note">
          这些信息只保存在你自己的浏览器里，不会上传，也不收集姓名和手机号。填完随时可以在右上角修改。
        </p>

        <div className="gate-actions">
          <button className="text-button gate-skip" onClick={onSkip}>先跳过</button>
          <button
            className="primary-button"
            disabled={!ready}
            onClick={() => onSubmit({ province, city, school, major: major.trim() })}
          >
            进入工作台<ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
