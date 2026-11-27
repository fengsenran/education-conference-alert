// Research scope confirmed by the user on 2026-11-24, calibrated against
// Qin Yuyou team's population/resources/public-education research, not all K-12 research.
const axes=[
 ['人口变化与流动',/学龄人口|教育人口|人口变动|人口变化|人口减少|人口负增长|少子化|生源减少|人口流动|人口迁移|流入|流出|demograph|population (?:decline|change|growth|shift)|declining enrol|enrollment decline|enrolment decline|school.age population|pupil projection|migration|migrant/i],
 ['县域城乡与乡村教育',/县域|城乡|乡村|农村|偏远地区|乡镇|rural|remote (?:school|communit)|urban.rural|rural.urban|county.level|rural district/i],
 ['学校布局与资源配置',/学校布局|撤点并校|小规模学校|寄宿制学校|县中|县域普通高中|三类学校|学位供给|教育资源|资源统筹|资源配置|师资配置|教师配置|师资供给|教师供给|教师编制|教师转岗|教师分流|经费配置|财政投入|转移支付|学校选址|闲置校舍|班级规模|小班化|学校规模|school (?:closure|consolidation|location|network|capacity|place|funding|financ)|small (?:rural )?school|boarding school|teacher (?:allocation|supply|shortage|deployment|redistribution|mobility)|resource (?:allocation|distribution|redistribution)|class size|education(?:al)? financ|school size/i],
 ['公共教育服务与制度机制',/公共教育服务|教育服务供给|教育供给|教育体系结构|教育结构|教育治理|财政体制|教育投入|就近入学|入学条件|入学机会|教育可及|教育共同体|教育一体化|优质均衡|城乡教育公平|城乡义务教育|普职|education(?:al)? service provision|public education|school govern|education(?:al)? govern|funding formula|school access|access to school|school admission|catchment|education(?:al)? provision/i]
];
const higher=/高等教育|高校|大学组织|大学治理|本科|研究生|higher education|universit|\bcollege\b|postsecondary|tertiary|hispanic.serving institution|\bHSI\b/i;
const k12=/基础教育|义务教育|学前教育|农村教育|乡村教育|公共教育服务|小学|初中|高中|中小学|县中|学校|教师|幼儿园|学龄|K[–-]?12|primary|secondary|elementary|preschool|kindergarten|pupil|school|teacher/i;
export function researchFit(title,abstract='') {
 const t=title.replace(/\s+/g,' '),a=abstract||'',combined=t+' '+a;
 if(/成人教育|老年教育|adult education|older adult|lifelong learning/i.test(t))return {eligible:false,reason:'研究对象不是基础教育'};
 if(!k12.test(combined))return {eligible:false,reason:'没有基础教育研究对象'};
 if(higher.test(t)&&!/中小学|基础教育|义务教育|学前教育|小学|初中|高中|primary school|secondary school|K[–-]?12/i.test(t))return {eligible:false,reason:'主要研究对象为高等教育'};
 const titleAxes=axes.filter(([,r])=>r.test(t));
 const allAxes=axes.filter(([,r])=>r.test(combined));
 const names=allAxes.map(([n])=>n);
 const structural=names.includes('学校布局与资源配置')||names.includes('公共教育服务与制度机制');
 // A generic mention of reform/equity in an abstract is not a research problem.
 if(!structural)return {eligible:false,reason:'未明确关联人口、县域城乡、教育资源或公共服务机制'};
 if(!titleAxes.length&&allAxes.length<3)return {eligible:false,reason:'标题线索不足，摘要也未提供至少三类直接研究依据'};
 if(allAxes.length<2)return {eligible:false,reason:'只有单一泛化线索，尚不足以证明研究相关性'};
 const evidence=allAxes.map(([axis,re])=>{const m=re.exec(t)||re.exec(a);return {axis,phrase:m?.[0]||''};});
 return {eligible:true,topics:names,score:titleAxes.length*12+allAxes.length*3,evidence,
  rationale:evidence.map(e=>`${e.axis}（${e.phrase}）`).join('；')};
}
export function isRoundup(title) {return /汇总|合集|集锦|一览|盘点|有哪些|信息合辑|信息汇编|征稿\s*\d+\s*场|会议.*\d+\s*场/.test(title);}
export function highLevelEducationConference(title,body) {
 if(!/教育/.test(title)||!/全国|中国|国际|年会|高峰|教育强国/.test(title))return null;
 const lines=body.split('\n').filter(l=>/主办|承办|指导单位/.test(l));
 const line=lines.find(l=>/中国教育学会|中国教育发展战略学会|中国教育科学研究院|中国教育学会农村教育分会|教育部|北京师范大学|华东师范大学|东北师范大学|华中师范大学|南京师范大学|安徽师范大学/.test(l));
 return line?{eligible:true,topics:['综合性教育会议：主办机构可核验'],score:1,evidence:[{axis:'组织单位',phrase:line.slice(0,200)}],rationale:'主办/承办原文：'+line.slice(0,200)}:null;
}
