import test from 'node:test';
import assert from 'node:assert/strict';
import {researchFit,isRoundup,highLevelEducationConference} from './research-profile.mjs';
test('team research problems qualify through population, geography, allocation and services',()=>{
 for(const title of ['人口变化下基础教育资源统筹调配研究','人口变动下县域中小学校布局调整的类型学研究','人口负增长时代乡村小规模学校高质量发展的现实困境与推进路径','面向2035年乡镇寄宿制学校建设的政策迭代研究','人口变动趋势下基础教育师资配置机制研究','Rural school funding formulas and access to primary education'])assert.equal(researchFit(title).eligible,true,title);
});
test('high-school capacity expansion is recognised as resource planning in the real exported example',()=>{
 assert.equal(researchFit('面向2035的高中教育规模波动与扩容应对','高中学龄人口即将迎来峰值，扩容需统筹新建学校、学位供给和人口向城区流动。').eligible,true);
});
test('actual wrong digital-classroom recommendation and unrelated teaching do not qualify',()=>{
 const wrong='The (In)Visibility of Social Interactions in the Digital Classroom: A Review of Research on Digitally Mediated K–12 Science Instruction in the United States from 2012 to 2022';
 assert.equal(researchFit(wrong,'K–12 science instruction increasingly uses computers alongside science education reforms.').eligible,false);
 assert.equal(researchFit('以特色学科建设孕育县中振兴的内生活力：基本逻辑与关键路径','县中振兴以教学学术创新实践和学科特色推动城乡二元结构下的县中发展。').eligible,false);
 assert.equal(researchFit('乡村小学生科学课堂合作学习研究','教育公平与教学创新').eligible,false);
 assert.equal(researchFit('高校机构建立与组织变革研究','教育治理和教育公平').eligible,false);
 assert.equal(researchFit('社会生态系统理论下乡村教师韧性发展的动力与路径','乡村教师韧性可以保障教育供给稳定、提升教育资源配置效益。').eligible,false);
 assert.equal(researchFit('Racial Status Threat and Anti-DEI Efforts in Local School Districts','Demographic changes influence school board elections and book bans in U.S. school districts.').eligible,false);
 assert.equal(researchFit('The Lingering Legacy of Redlining on School Funding, Diversity, and Performance','School funding relies on local revenue and federal aid. Historic housing discrimination continues to shape public education.').eligible,true);
});

test('a non-descriptive title can qualify only with strong research evidence in the abstract',()=>{
 assert.equal(researchFit('Adapting to change','Demographic decline in rural communities requires primary school resource allocation.').eligible,true);
 assert.equal(researchFit('New challenges','Rural teachers use digital tools for classroom learning.').eligible,false);
});
test('roundups are discovery material; high-level general meetings require named organisers',()=>{
 assert.equal(isRoundup('2026年11—12月学术会议征稿5场汇总'),true);
 assert.equal(isRoundup('全国基础教育高质量发展学术年会'),false);
 assert.equal(highLevelEducationConference('全国基础教育高质量发展学术年会','主办单位：中国教育学会').eligible,true);
 assert.equal(highLevelEducationConference('全国基础教育高质量发展学术年会','欢迎投稿'),null);
});
