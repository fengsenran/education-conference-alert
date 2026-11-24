import test from 'node:test';
import assert from 'node:assert/strict';
import {researchFit,isRoundup,highLevelEducationConference} from './research-profile.mjs';
test('team research problems qualify through population, geography, allocation and services',()=>{
 for(const title of ['人口变化下基础教育资源统筹调配研究','人口变动下县域中小学校布局调整的类型学研究','人口负增长时代乡村小规模学校高质量发展的现实困境与推进路径','面向2035年乡镇寄宿制学校建设的政策迭代研究','人口变动趋势下基础教育师资配置机制研究','Rural school funding formulas and access to primary education'])assert.equal(researchFit(title).eligible,true,title);
});
test('actual wrong digital-classroom recommendation and unrelated teaching do not qualify',()=>{
 const wrong='The (In)Visibility of Social Interactions in the Digital Classroom: A Review of Research on Digitally Mediated K–12 Science Instruction in the United States from 2012 to 2022';
 assert.equal(researchFit(wrong,'K–12 science instruction increasingly uses computers alongside science education reforms.').eligible,false);
 assert.equal(researchFit('乡村小学生科学课堂合作学习研究','教育公平与教学创新').eligible,false);
 assert.equal(researchFit('高校机构建立与组织变革研究','教育治理和教育公平').eligible,false);
});
test('roundups are discovery material; high-level general meetings require named organisers',()=>{
 assert.equal(isRoundup('2026年11—12月学术会议征稿5场汇总'),true);
 assert.equal(isRoundup('全国基础教育高质量发展学术年会'),false);
 assert.equal(highLevelEducationConference('全国基础教育高质量发展学术年会','主办单位：中国教育学会').eligible,true);
 assert.equal(highLevelEducationConference('全国基础教育高质量发展学术年会','欢迎投稿'),null);
});
