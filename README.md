# 免费的教育会议微信推送

已按你的要求准备：每天北京时间 08:30 触发，国内会议，优先农村教育、教育政策、教育公平。电脑关机也可运行。当前只是程序包，上传、添加密钥并测试前，自动推送尚未启用。

## 1. 注册免费账号

打开 https://github.com/signup ，用邮箱注册个人账号，选择 GitHub Free 并完成邮箱验证。无须购买 Pro 或输入付款信息。密码、邮箱验证码都由你自己保管。

官方注册说明：https://docs.github.com/en/account-and-profile/how-tos/account-management/creating-an-account-on-github

## 2. 创建存放程序的仓库

登录后打开 https://github.com/new ：

- Repository name（仓库名称）：`education-conference-alert`
- Visibility：选择 Public（公开）。这样标准 Ubuntu 云端运行器免费。公开的是程序和已发送的会议去重记录，不要把任何个人材料或密钥上传到代码文件。
- 勾选 Add a README file（初始化一个说明文件），点击 Create repository。

官方计费说明：https://docs.github.com/en/billing/concepts/product-billing/github-actions

## 3. 上传程序

解压下载的 ZIP。进入仓库，点击 Add file → Upload files，将解压文件夹内的所有文件和 `.github` 文件夹上传到仓库根目录。不是上传 ZIP，也不是把外层 `education_wechat_cloud` 文件夹上传进去。点击 Commit changes 保存。

上传后，根目录应能看到 `monitor.mjs`、`monitor.test.mjs`、`config.json`、`state.json` 和 `.github` 文件夹。

如果上传时 `.github` 文件夹被漏掉：点击 Add file → Create new file，在文件名填写 `.github/workflows/daily.yml`，复制本包 `定时任务备用.txt` 的全部内容到正文，Commit changes 保存。

此时云端定时任务已能触发，但还需要下一步的 SendKey 才能发送微信。建议连续完成后面的步骤。

## 4. 把推送密钥保存在 GitHub 加密设置

到仓库 Settings → Secrets and variables → Actions → New repository secret：

- Name：`SERVERCHAN_SENDKEY`
- Secret：你在 Server酱 Turbo 的 SendKey 页面看到的、以 `SCT` 开头的完整密钥。
- 点击 Add secret。

不要将密钥放进 config.json、代码、README、Issue 或聊天。程序只会把密钥用于请求 Server酱的官方推送接口。

Server酱官方接入说明：https://sct.ftqq.com/docs/integrations/github-actions/

## 5. 测试连接

进入仓库 Actions → 教育会议微信推送 → Run workflow：

- 保持 mode 为 `test`，再次点击 Run workflow。
- 等待任务结束，微信应收到“教育会议推送连接测试”。任务绿色只代表服务接受请求，仍须在微信确认实际接收。
- 再运行一次，mode 选择 `send`，检索后推送今天的会议汇总。可能需要几分钟。
- 若没有新发现，会如实报告本次监测范围内未确认新的可投稿会议。不会编造会议。

正常部署后每天北京时间 08:30 触发。GitHub 免费调度可能延迟或偶尔漏触发，08:30 不是保证送达时间。公开仓库连续60天没有活动可能停用定时任务；本程序正常发送后会提交去重记录，但仍建议偶尔查看 Actions 是否正常。

官方调度限制：https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

## 费用和覆盖范围

- Server酱 Turbo 当前免费版每天最多5条。本程序正常每天1条汇总；手动测试也消耗当天额度。免费版卡片只显示标题，正文保留1天，请及时打开并保存官方链接。
- 使用公开仓库、标准 ubuntu-latest 云端运行器；程序没有调用收费搜索接口或AI API，没有购买会员或云服务器的步骤。不要改用付费大型运行器。
- 只读取 config.json 配置的六个官方来源，每个来源只检查列表前16个会议候选链接。不是全网检索，可能漏掉其他学校、微信公众号、附件里的征稿和列表深处的通知。
- 截止日期必须能识别出含年份的投稿日期，同时能确认国内地点；无法确认、仅有图片/PDF附件或年份不清的通知暂不列为可投稿。规则筛选可能漏检或误判，投稿前必须查看官方原文。
- 默认优先主题见 config.json 的 topics，可自行扩充。每条含题目、匹配主题、截止日期、时间地点、主办/承办、费用线索和原文链接。未能识别的字段会明确标注。
- GitHub 云端IP可能被部分学校拦截。部分抓取失败会在汇总里注明，全部失败会发送异常通知；不会把检索失败说成“没有会议”。
- 不重复发送已记录的同一标题和截止日期，但不同机构转载标题变化时可能重复。state.json 用于去重，不要反复覆盖它，否则会再次推送旧通知。

免费额度和通道说明：
https://sct.ftqq.com/docs/getting-started/faq/
https://sct.ftqq.com/docs/getting-started/channels/

## 查看、暂停与排错

- 点击每次 Actions 运行页面查看 Summary（摘要）和日志；本地预览文件位于 reports/，不会上传到代码。
- 只有监测服务接受推送请求后，程序才更新 state.json。
- 如果失败在“保存去重状态”，检查 Settings → Actions → General → Workflow permissions 是否允许 Read and write permissions，以及默认分支是否禁止机器人直接提交。未保存去重状态时下一次可能重复发送。
- 暂停：Actions → 教育会议微信推送 → 右侧菜单 → Disable workflow。恢复时 Enable workflow。
- 只检查、不发微信：Run workflow 中选择 `dry-run`，不需要密钥。
- 全站失败或推送超时时不会自动重试，以免反复扣免费额度或重复发消息；先查 Server酱记录和 GitHub 日志后再手动运行。

## 本地验证（可跳过）

需 Node.js 24，无第三方依赖：

```sh
node --test monitor.test.mjs
node monitor.mjs --dry-run
```

2026-11-17 本机验证：5项测试通过；6个来源入口读取成功，检查41个候选页面，无请求错误；本次未确认符合条件的新会议。这个结果仅代表当次有限来源监测，不是全网没有征稿。没有使用你的 SendKey，也尚未做实际微信连接测试。
