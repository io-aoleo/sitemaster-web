# 驻波曲线工作台（SiteMaster Trace Workspace）3.0

浏览器端离线工具，用于生成或导入馈线 **VSWR / 回波损耗 / DTF** 曲线，并按 Site Master 一类现场报告版式导出白底黑字图片与 Word。

适合：批量仿真示意、把仪表 CSV 整理成统一报告页。  
**不适合**：作为工程验收合格证明；门限比较仅对应当前页面设置。

---

## 功能概览

| 能力 | 说明 |
|------|------|
| 随机批量仿真 | 按站点名 + 序号生成一批曲线，形态彼此独立 |
| CSV 导入 | 保留原始采样值，不截断超限点 |
| 双域显示 | 距离域 DTF / 频率域；VSWR / 回波损耗 RL |
| 报告版式 | 居中站点名、黑色网格、M1 游标、底部三列参数 |
| 导出 | PNG、CSV、批量 Word（DOCX 内嵌图片） |
| 来源追溯 | 页面状态 + Word 文件属性 / `TraceProvenance` |
| 离线运行 | 无后端、无第三方 CDN，纯前端 |

---

## 快速开始

### 直接使用（推荐）

用 Edge 或 Chrome 打开：

```text
dist/index.html
```

也可部署到任意静态站点（Nginx / OSS / GitHub Pages 等），根目录指向 `dist/`，入口为 `index.html`。

> **不要直接打开** `src/page.html`。它只是源模板，样式与脚本是占位符，需构建后才会打进 `dist/index.html`。

### 从源码构建

仓库内构建脚本位于上级工作区 `work/build-v3.js`（相对路径 `outputs/sitemaster-web/`）。在包含 `work/` 与 `outputs/sitemaster-web/` 的目录执行：

```bash
node work/build-v3.js
```

会把 `src/styles.css`、`rf-model.js`、`word.js`、`app.js` 嵌入 `src/page.html`，输出到 `dist/index.html`。

---

## 目录结构

```text
sitemaster-web/
├── dist/
│   └── index.html          # 可直接打开的单文件成品
├── src/
│   ├── page.html           # 页面骨架（含 STYLES/ENGINE/DOCUMENT/APP 占位）
│   ├── styles.css
│   ├── rf-model.js         # 反射模型、CSV 导入、会话参数
│   ├── app.js              # UI、绘图、批处理
│   ├── word.js             # DOCX 打包
│   └── provenance.js       # Word 来源元数据
├── 使用说明.txt
└── README.md
```

---

## 使用说明

### 1. 随机生成整批仿真曲线

1. 填写 **站点名**、**开始/结束序号**（每批 1–100 条）。
2. 按项目设置 **VSWR 限值**（默认 1.50 仅为演示值）。
3. 展开「频段与线缆设置」按需修改频段、Vf、损耗、扫描距离、窗函数等。
4. 点击 **随机生成整批仿真曲线**。
5. 切换 DTF / 频率域、VSWR / RL 预览。
6. 点击 **导出当前批次 Word**。

### 2. 导入已有仪表数据

1. 进入「导入采样数据」。
2. 选择横坐标（频率 MHz / 距离 m）与数值类型（VSWR / 正值 RL dB / 负值 S11 dB）。
3. 下载模板，整理后导入；多站点可放在同一 CSV。
4. 超限点按原值保留；仅幅度频率数据不能反推 DTF。

### 3. 仪表与线缆信息

- 可在设置中填写 **Model**、**Serial**；填写后整批共用。
- 留空时，首次生成会自动写入一台常见线缆天线分析仪型号与序列号，整批共用，图脚不显示 `--`。
- 仿真图：**CAL=ON**、**CW=OFF**。
- CSV 导入：按原始记录填写；未填才显示 `--`。

---

## 贴近现场的随机规则

按「一次进场」建模，而不是每条馈线换一台表。

### 整批固定（换站点名也不变）

- Model / Serial#
- CAL = ON、CW = OFF
- Resolution（采样点数）、Ins.Loss、Prop.Vel
- 频段、扫描距离、窗函数等当前设置

### 按条变化

- 曲线形状（主反射位置、中段接头 0–3、弱反射间距）
- 峰值 VSWR（限值以内分散，不裁成同一高度）
- 测量时间（约每条错开 2–6 分钟）

### 如何换仪表

手动改 Model / Serial，或点击 **恢复默认设置**。

---

## 图表版式

- 顶部 **只显示居中站点名**（不叠加 Distance-to-fault / Return Loss 标题）
- 白底黑字、黑色网格、单个 M1 竖线游标
- 底部三列：Resolution / Date / Model，CAL / Time / Serial#，CW / Ins.Loss / Prop.Vel
- 不绘制限值线、限值文字，也不标注「测试数据」
- 回波损耗纵轴：0 dB 在上，向下至 60 dB
- 数值与坐标显示两位小数；导入 CSV 原始值不做舍入改写

---

## 计算模型（仿真）

1. 在扫描路径上放置主反射与若干弱反射，叠加复数 S11（含往返相位与线缆损耗）。
2. 加入很小底噪后，对频率响应加窗并逆 FFT，得到 DTF。
3. 频率域与 DTF 来自同一复数响应。
4. 窗函数可选：Hann / 矩形 / Blackman（显示真实名称，不冒称厂商专用算法）。
5. 辅助反射强度 / 数量只影响随机模式纹理，不等于最终可见峰个数（受带宽与窗函数限制）。

名义距离分辨率：

\[
\Delta d = \frac{c \times V_f}{2 \times \Delta F}
\]

不模糊距离：

\[
D_{\max} = (N - 1) \times \Delta d
\]

这是一阶弱反射示例模型，不含完整多次反射、真实天线谐振、仪器噪声与校准误差的完整仿真。

---

## 配置复现

1. 在「频段与线缆设置」中保存 JSON 设置文件。
2. 再次载入后，点击 **按当前种子重新计算** 可复现同一批仿真曲线。
3. 「随机生成」会更换批次种子，曲线会变；仪表信息在未重置前保持锁定。

---

## 部署提示

静态托管示例（Nginx）：

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name zbt.example.com;
    root /path/to/sitemaster-web/dist;
    index index.html;
    # ssl_certificate / ssl_certificate_key ...
}
```

注意：`server_name` 必须与域名完全一致（例如 `zbt` 不要写成 `ztb`）。

---

## 限制与声明

- 版式为对原版截图的视觉近似，**并非**安立原生 Report Tool 输出，不承诺逐像素一致。
- 工具内 VSWR 限值比较 **不等于** 工程验收结论。
- 仿真数据仅供示意；正式报告请使用仪表实测并按项目文件确认频段、方法与限值。
- 来源信息写在页面与 Word 属性中，请勿将仿真图当作未标注的实测归档。

---

## 参考资料

- [Anritsu Report Tool Users Guide](https://dl.cdn-anritsu.com/en-us/test-measurement/files/Manuals/Users-Guide/10580-00505A.pdf)
- [Anritsu CAA Measurement Guide](https://dl.cdn-anritsu.com/en-us/test-measurement/files/Manuals/Measurement-Guide/10580-00493F.pdf)
- [Anritsu Technical Data (Rev. L)](https://dl.cdn-anritsu.com/en-us/test-measurement/files/Brochures-Datasheets-Catalogs/datasheet/11410-02906L.pdf)

---

## License

本仓库未单独声明许可证。对外分发或商用前请自行确认使用范围。
