@echo off
rem 双击启动本地服务器并打开浏览器（需要已安装 Python）
start "" http://localhost:4620
python -m http.server 4620
