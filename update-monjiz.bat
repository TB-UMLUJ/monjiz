@echo off
cd /d "C:\monjez"

echo ==== ADDING FILES ====
git add .

echo ==== COMMITTING ====
git commit -m "Update from local machine"

echo ==== PULLING LATEST CHANGES ====
git pull origin main

echo ==== PUSHING TO GITHUB ====
git push origin main

echo ==== DONE ====
pause
