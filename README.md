# 家电制冷空调零部件关税查询

这是一个纯静态网页，可以直接部署到 GitHub Pages、Vercel、Netlify、公司内网静态目录或任意 Web 服务器。

## 文件

- `index.html`：页面入口
- `styles.css`：页面样式
- `app.js`：筛选、表格和链接逻辑
- `data.js`：公开版税率数据

## 部署方式

把本目录 `outputs/tariff-dashboard/` 下的全部文件作为静态站点根目录发布即可。

当前公开发布地址：

- Netlify: https://magnificent-bombolone-8e7242.netlify.app
- GitHub: https://github.com/betasidian-ctrl/tariff-dashboard

常见方式：

- GitHub Pages：把这些文件提交到仓库根目录或 `docs/` 目录，然后启用 Pages。
- Vercel / Netlify：新建静态站点，项目根目录指向本目录，无需构建命令。
- 内网服务器：把本目录复制到 Nginx/Apache 静态目录。

当前 Netlify 项目已连接 GitHub 仓库 `betasidian-ctrl/tariff-dashboard`，并开启 main 分支自动发布；每次提交更新会自动发布到同一个 Netlify 地址。

## 数据更新

每日自动化会核验官方来源并更新 `data.js` 或页面逻辑。主表只显示短数字；公式、来源、AD/CVD 案号和适用假设放在右侧详情和页面底部。

公开版不会展示原采购表的真实金额，只保留非敏感规模等级。
