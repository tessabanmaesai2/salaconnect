@echo off
chcp 65001 >nul
title SALA CONNECT - Sync to GitHub
color 0B
cd /d "%~dp0"
echo ============================================================
echo   SALA CONNECT - SYNC TO GITHUB (tessabanmaesai2/salaconnect)
echo ============================================================
echo.
echo [1/3] รวบรวมไฟล์ที่แก้ไขทั้งหมด (Git Add and Commit)...
git add .
git commit -m "Update SALA CONNECT: %date% %time%" 2>nul

echo.
echo [2/3] ตรวจสอบและซิงก์กิ่ง main กับ GitHub...
git pull origin main --rebase --autostash 2>nul

echo.
echo [3/3] อัปโหลดขึ้น GitHub (tessabanmaesai2/salaconnect)...
git push -u origin main
echo.
if %errorlevel% neq 0 (
    echo [NOTE] หากขึ้นข้อผิดพลาด กรุณาตรวจสอบว่ากดสร้าง Repository บน GitHub สำเร็จแล้วหรือยัง
) else (
    echo ============================================================
    echo [SUCCESS] ส่งข้อมูลขึ้น GitHub เรียบร้อยแล้ว!
    echo ============================================================
)
echo.
echo กดปุ่มใดๆ เพื่อปิดหน้าต่างนี้...
pause >nul
