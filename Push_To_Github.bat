@echo off
chcp 65001 >nul
title SALA CONNECT - Sync to GitHub
color 0B
cd /d "%~dp0"
echo ============================================================
echo   SALA CONNECT - SYNC TO GITHUB (tessabanmaesai2/salaconnect)
echo ============================================================
echo.
echo [1/2] รวบรวมไฟล์ที่แก้ไขทั้งหมด (Git Add and Commit)...
git add .
git commit -m "Update SALA CONNECT: %date% %time%"
echo.
echo [2/2] อัปโหลดขึ้น GitHub (tessabanmaesai2/salaconnect)...
git push -u origin main
echo.
echo ============================================================
echo [SUCCESS] ส่งข้อมูลขึ้น GitHub เรียบร้อยแล้ว!
echo ============================================================
echo.
echo กดปุ่มใดๆ เพื่อปิดหน้าต่างนี้...
pause >nul

