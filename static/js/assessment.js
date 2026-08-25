/**
 * static/js/assessment.js
 * Browser OCR + Interactive Questionnaires (SAS-SV & PHQ-9)
 */

const SAS_QUESTIONS = [
    "Missing planned work due to smartphone use.",
    "Having a hard time concentrating in class, while doing assignments, or while working.",
    "Feeling pain in the wrists or at the back of the neck while using a smartphone.",
    "Won't be able to stand not having a smartphone.",
    "Feeling impatient and fretful when I am not holding my smartphone.",
    "Having my smartphone in my mind even when I am not using it.",
    "I will never give up using my smartphone even when my daily life is already greatly affected by it.",
    "Constantly checking my smartphone so as not to miss conversations on social media.",
    "Using my smartphone longer than I had intended.",
    "The people around me tell me that I use my smartphone too much."
];

const PHQ_QUESTIONS = [
    "Little interest or pleasure in doing things.",
    "Feeling down, depressed, or hopeless.",
    "Trouble falling or staying asleep, or sleeping too much.",
    "Feeling tired or having little energy.",
    "Poor appetite or overeating.",
    "Feeling bad about yourself — or that you are a failure or have let yourself or your family down.",
    "Trouble concentrating on things, such as reading the newspaper or watching television.",
    "Moving or speaking so slowly that other people could have noticed? Or being so fidgety or restless.",
    "Thoughts that you would be better off dead, or of hurting yourself in some way."
];

function renderSurveys() {
    const sasContainer = document.getElementById('sas_survey');
    const phqContainer = document.getElementById('phq_survey');

    if (sasContainer) {
        sasContainer.innerHTML = "";
        SAS_QUESTIONS.forEach((q, index) => {
            let html = `<div class="survey-question"><p>${index + 1}. ${q}</p><div class="survey-options">`;
            for (let i = 1; i <= 6; i++) {
                html += `<label><input type="radio" name="sas_q${index}" value="${i}"> ${i}</label>`;
            }
            html += `</div></div>`;
            sasContainer.innerHTML += html;
        });
    }

    if (phqContainer) {
        phqContainer.innerHTML = "";
        PHQ_QUESTIONS.forEach((q, index) => {
            let html = `<div class="survey-question"><p>${index + 1}. ${q}</p><div class="survey-options">`;
            for (let i = 0; i <= 3; i++) {
                html += `<label><input type="radio" name="phq_q${index}" value="${i}"> ${i}</label>`;
            }
            html += `</div></div>`;
            phqContainer.innerHTML += html;
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderSurveys();

    const wizardForm = document.getElementById('assessmentWizard');
    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const statusDiv = document.getElementById('extractionStatus');

    // --- MULTIPLE FILE UPLOAD & OCR LOGIC ---
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) uploadAndExtractFiles(e.target.files);
        });
    }

    document.addEventListener('paste', (e) => {
        const step2 = document.getElementById('step2');
        if (!step2 || !step2.classList.contains('active')) return;
        
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        if (!items) return;
        
        let pastedFiles = [];
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                pastedFiles.push(item.getAsFile());
            }
        }
        if (pastedFiles.length > 0) uploadAndExtractFiles(pastedFiles);
    });

    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eName => {
            dropZone.addEventListener(eName, (e) => e.preventDefault(), false);
        });
        dropZone.addEventListener('drop', (e) => {
            if (e.dataTransfer.files.length > 0) uploadAndExtractFiles(e.dataTransfer.files);
        });
    }

    async function uploadAndExtractFiles(files) {
        if (!statusDiv) return;

        const fileArray = Array.from(files);
        statusDiv.style.color = 'var(--color-teal)';
        statusDiv.innerText = `INITIALIZING AI PIPELINE FOR ${fileArray.length} IMAGE(S)...`;
        
        let totalMins = 0;
        let totalUnlocks = 0;
        let totalSocialMins = 0;
        
        const targetApps = ['instagram', 'whatsapp', 'youtube', 'chrome', 'tiktok', 'facebook', 'snapchat', 'chatgpt', 'reddit', 'twitter', 'x', 'netflix', 'safari', 'messages'];
        const socialApps = ['instagram', 'tiktok', 'facebook', 'snapchat', 'twitter', 'x', 'reddit'];
        let appUsageHtml = "";

        try {
            const worker = await Tesseract.createWorker('eng');
            
            for (let i = 0; i < fileArray.length; i++) {
                statusDiv.innerText = `SCANNING IMAGE ${i + 1} OF ${fileArray.length} (OS DETECTION)...`;
                const ret = await worker.recognize(fileArray[i]);
                const text = ret.data.text;

                let hours = 0;
                let minutes = 0;
                let unlocks = 0;
                let foundTotalTime = false;

                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                
                // 1. Direct Anchor Search for total screen time
                for (let j = 0; j < lines.length; j++) {
                    let currentLine = lines[j].toLowerCase();
                    
                    if (currentLine.includes("screen time today") || currentLine.includes("daily average") || currentLine.includes("screen time")) {
                        for (let k = j; k <= Math.min(j + 2, lines.length - 1); k++) {
                            let block = lines[k];
                            
                            let comboMatch = block.match(/(\d+)\s*h[^\d]*(\d+)\s*m/i);
                            if (comboMatch) {
                                hours = parseInt(comboMatch[1], 10);
                                minutes = parseInt(comboMatch[2], 10);
                                foundTotalTime = true;
                                break;
                            }
                            
                            let singleHourMatch = block.match(/^(\d+)\s*h$/i);
                            if (singleHourMatch) {
                                hours = parseInt(singleHourMatch[1], 10);
                                foundTotalTime = true;
                                break;
                            }
                        }
                        if (foundTotalTime) break;
                    }
                }

                // 2. Fallback for Screen Time
                if (!foundTotalTime) {
                    let topMatches = text.match(/(\d+)\s*h/gi);
                    if (topMatches && topMatches.length > 0) {
                        let firstVal = topMatches[0].match(/\d+/);
                        if (firstVal) hours = parseInt(firstVal[0], 10);
                    }
                }

                // 3. Robust Unlocks/Pickups Extraction (No hallucinations)
                // Looks for "60 unlocks", "Pickups: 60", etc.
                const unlockMatch = text.match(/(?:(\d+)\s*(?:unlocks|pickups|times|sessions))/i) || text.match(/(?:pickups|unlocks)[^\d]*(\d+)/i);
                if (unlockMatch) {
                    unlocks = parseInt(unlockMatch[1] || unlockMatch[2], 10);
                }

                totalMins += (hours * 60) + minutes;
                totalUnlocks += unlocks; // If nothing found, adds 0.

                // --- APP BREAKDOWN & SOCIAL MEDIA EXTRACTION ---
                for (let j = 0; j < lines.length; j++) {
                    let currentLine = lines[j].toLowerCase();
                    let matchedApp = targetApps.find(app => currentLine === app || currentLine.includes(app));

                    if (matchedApp) {
                        for (let k = j; k <= Math.min(j + 2, lines.length - 1); k++) {
                            let checkLine = lines[k];
                            // Improved regex for app times
                            let timeMatch = checkLine.match(/(?:(\d+)\s*h[a-z]*\s*)?(\d+)\s*m[a-z]*/i) || checkLine.match(/^(\d+)\s*h[a-z]*$/i);
                            
                            if (timeMatch && !checkLine.toLowerCase().includes('screen time')) {
                                
                                let appHours = timeMatch[1] ? parseInt(timeMatch[1], 10) : 0;
                                let appMins = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                                
                                if (checkLine.match(/^(\d+)\s*h[a-z]*$/i)) {
                                    appHours = parseInt(timeMatch[1] || timeMatch[0].match(/\d+/)[0], 10);
                                    appMins = 0;
                                }

                                if (socialApps.includes(matchedApp)) {
                                    totalSocialMins += (appHours * 60) + appMins;
                                }

                                let cleanAppName = matchedApp.charAt(0).toUpperCase() + matchedApp.slice(1);
                                let cleanTime = checkLine.toUpperCase();
                                
                                appUsageHtml += `
                                <div style="display: flex; justify-content: space-between; padding: 12px 10px; border-bottom: 2px solid var(--border-color);">
                                    <span style="font-weight: 800; text-transform: uppercase;">${cleanAppName}</span>
                                    <span style="color: var(--color-blue); font-weight: 800;">${cleanTime}</span>
                                </div>`;
                                break;
                            }
                        }
                    }
                }
            }
            await worker.terminate();

            let finalHours = Math.floor(totalMins / 60);
            if (totalMins % 60 > 30) finalHours += 1;
            const computedHours = finalHours > 0 ? finalHours : 0; 

            // Calculate extracted social media hours
            let extractedSocialHours = parseFloat((totalSocialMins / 60).toFixed(1));

            // Populate form fields directly (no forcing estimates on unlocks)
            document.getElementById('daily_screen_time_hours').value = computedHours;
            document.getElementById('social_media_hours').value = extractedSocialHours;
            
            // Only set unlocks if OCR found them, else leave blank
            if (totalUnlocks > 0) {
                document.getElementById('unlock_frequency').value = totalUnlocks;
            } else {
                document.getElementById('unlock_frequency').value = ""; // Leave blank for manual entry
            }

            if (appUsageHtml !== "") {
                document.getElementById('appBreakdownList').innerHTML = appUsageHtml;
                document.getElementById('appBreakdownContainer').style.display = "block";
            }

            statusDiv.style.color = 'var(--color-green)';
            statusDiv.innerText = `SUCCESS! PLEASE VERIFY EXTRACTED METRICS BELOW.`;
            
        } catch (err) {
            console.error(err);
            statusDiv.style.color = 'var(--color-red)';
            statusDiv.innerText = 'PIPELINE ERROR. PLEASE TRY CLEARER IMAGES OR ENTER MANUALLY.';
        }
    }

    // --- FORM SUBMISSION ---
    if (wizardForm) {
        wizardForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            try {
                if (!document.getElementById('consentCheck').checked) {
                    alert('You must consent to proceed.');
                    goToStep(1); return;
                }

                const screenTimeVal = document.getElementById('daily_screen_time_hours').value;
                const socialMediaVal = document.getElementById('social_media_hours').value || 0;
                const sleepVal = document.getElementById('sleep_hours').value || 7.0;
                
                // If unlock is left blank, default to 0 for the ML model
                const unlockInput = document.getElementById('unlock_frequency').value;
                const unlockVal = unlockInput !== "" ? parseInt(unlockInput, 10) : 0;

                if (screenTimeVal === '' || screenTimeVal === '0') {
                    alert('Please provide your total screen time in Step 2.');
                    goToStep(2); return;
                }

                // Validate PHQ-9 (Step 3)
                let phqTotal = 0;
                for (let i = 0; i < PHQ_QUESTIONS.length; i++) {
                    const selected = document.querySelector(`input[name="phq_q${i}"]:checked`);
                    if (!selected) {
                        alert(`Please answer Emotional Wellbeing question #${i + 1} in Step 3.`);
                        goToStep(3); return;
                    }
                    phqTotal += parseInt(selected.value, 10);
                }

                // Validate SAS-SV (Step 4)
                let sasTotal = 0;
                for (let i = 0; i < SAS_QUESTIONS.length; i++) {
                    const selected = document.querySelector(`input[name="sas_q${i}"]:checked`);
                    if (!selected) {
                        alert(`Please answer Digital Dependency question #${i + 1} in Step 4.`);
                        goToStep(4); return;
                    }
                    sasTotal += parseInt(selected.value, 10);
                }

                const payload = {
                    name: document.getElementById('userName')?.value.trim() || 'Anonymous',
                    age: parseInt(document.getElementById('age')?.value || '25', 10),
                    gender: document.getElementById('gender')?.value || 'Other',
                    occupation: document.getElementById('occupation')?.value || 'Student',
                    daily_screen_time_hours: parseFloat(screenTimeVal),
                    social_media_hours: parseFloat(socialMediaVal),
                    sleep_hours: parseFloat(sleepVal),
                    unlock_frequency: unlockVal,
                    sas_sv_score: sasTotal,   
                    phq9_score: phqTotal,     
                    gad7_score: 0 
                };

                const response = await fetch('/api/assessment/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const rawText = await response.text();
                let result = JSON.parse(rawText);

                if (response.ok && result.status === 'success') {
                    sessionStorage.setItem('last_result', JSON.stringify(result));
                    window.location.href = '/dashboard';
                } else {
                    alert('Server Error: ' + (result.error || 'Computation failed.'));
                }

            } catch (err) {
                console.error('Submission Error:', err);
                alert('Form error. Check console (F12).');
            }
        });
    }
});