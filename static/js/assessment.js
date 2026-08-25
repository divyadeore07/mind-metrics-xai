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

    function parseDuration(str) {
        let h = 0, m = 0;
        let combo = str.match(/(\d+)\s*(?:hrs?|hours?|h)\s*,?\s*(\d+)\s*(?:mins?|minutes?|m)/i);
        if (combo) {
            h = parseInt(combo[1], 10);
            m = parseInt(combo[2], 10);
            return { h, m, total: (h * 60) + m };
        }
        let hrOnly = str.match(/(\d+)\s*(?:hrs?|hours?|h\b)/i);
        if (hrOnly) h = parseInt(hrOnly[1], 10);

        let minOnly = str.match(/(\d+)\s*(?:mins?|minutes?|m\b)/i);
        if (minOnly) m = parseInt(minOnly[1], 10);

        return { h, m, total: (h * 60) + m };
    }

    async function uploadAndExtractFiles(files) {
        if (!statusDiv) return;

        const fileArray = Array.from(files);
        statusDiv.style.color = 'var(--color-teal)';
        statusDiv.innerText = `SCANNING SCREENSHOT WITH AI PIPELINE...`;
        
        let totalMins = 0;
        let totalUnlocks = 0;
        let totalSocialMins = 0;
        let extractedAppsArray = [];

        const allApps = ['chrome', 'instagram', 'google', 'youtube', 'whatsapp', 'tiktok', 'facebook', 'snapchat', 'twitter', 'x', 'reddit', 'safari', 'clock', 'chatgpt', 'netflix'];
        const socialApps = ['instagram', 'youtube', 'tiktok', 'facebook', 'snapchat', 'twitter', 'x', 'reddit', 'whatsapp'];

        try {
            const worker = await Tesseract.createWorker('eng');
            
            for (let i = 0; i < fileArray.length; i++) {
                const ret = await worker.recognize(fileArray[i]);
                const text = ret.data.text;

                // 1. Total Screen Time (e.g. "4 hrs, 10 mins")
                const exactTimeMatch = text.match(/(\d+)\s*(?:hrs?|hours?)\s*,?\s*(\d+)\s*(?:mins?|minutes?)/i);
                if (exactTimeMatch) {
                    totalMins += (parseInt(exactTimeMatch[1], 10) * 60) + parseInt(exactTimeMatch[2], 10);
                }

                // 2. Unlocks
                const unlockMatch = text.match(/(\d+)\s*(?:unlocks|pickups)/i);
                if (unlockMatch) {
                    totalUnlocks += parseInt(unlockMatch[1], 10);
                }

                // 3. Scan Lines for App Names & Durations
                const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                let usedIndices = new Set();

                for (let j = 0; j < rawLines.length; j++) {
                    let line = rawLines[j].toLowerCase();
                    let cleanLine = line.replace(/[^a-z0-9\s]/gi, ' ').trim();

                    // Find if any supported app is mentioned in this line
                    let matchedApp = allApps.find(app => {
                        let regex = new RegExp(`\\b${app}\\b`, 'i');
                        return regex.test(cleanLine);
                    });

                    if (matchedApp) {
                        // Scan the current line and the next 2 lines for the time value
                        for (let k = j; k <= Math.min(rawLines.length - 1, j + 2); k++) {
                            if (usedIndices.has(k)) continue;
                            let subLine = rawLines[k].toLowerCase();
                            if (subLine.includes('screen time') || subLine.includes('today')) continue;

                            let dur = parseDuration(subLine);
                            if (dur.total > 0 && dur.total < 1440) {
                                usedIndices.add(k);

                                let displayName = matchedApp.charAt(0).toUpperCase() + matchedApp.slice(1);
                                if (displayName === 'Youtube') displayName = 'YouTube';
                                if (displayName === 'Chatgpt') displayName = 'ChatGPT';

                                let timeStr = dur.h > 0 ? `${dur.h}h ${dur.m}m` : `${dur.m}m`;

                                extractedAppsArray.push({
                                    name: displayName,
                                    appKey: matchedApp,
                                    totalMins: dur.total,
                                    timeStr: timeStr,
                                    isSocial: socialApps.includes(matchedApp)
                                });
                                break;
                            }
                        }
                    }
                }
            }
            await worker.terminate();

            // Deduplicate and retain highest duration per app
            let uniqueMap = new Map();
            extractedAppsArray.forEach(app => {
                if (!uniqueMap.has(app.name) || uniqueMap.get(app.name).totalMins < app.totalMins) {
                    uniqueMap.set(app.name, app);
                }
            });

            // Sort descending by usage time
            let sortedApps = Array.from(uniqueMap.values()).sort((a, b) => b.totalMins - a.totalMins);

            // Accumulate Social Media Time
            sortedApps.forEach(app => {
                if (app.isSocial) {
                    totalSocialMins += app.totalMins;
                }
            });

            // Slice only TOP 3 for the display card
            let top3 = sortedApps.slice(0, 3);
            let appUsageHtml = "";

            top3.forEach(app => {
                appUsageHtml += `
                <div style="display: flex; justify-content: space-between; padding: 8px 6px; border-bottom: 1px solid var(--border-color);">
                    <span style="font-weight: 800; text-transform: uppercase;">${app.name}</span>
                    <span style="color: var(--color-blue); font-weight: 800;">${app.timeStr}</span>
                </div>`;
            });

            let exactDecimalHours = totalMins > 0 ? parseFloat((totalMins / 60).toFixed(1)) : 0.0;
            let extractedSocialHours = totalSocialMins > 0 ? parseFloat((totalSocialMins / 60).toFixed(1)) : 0.0;

            if (exactDecimalHours > 0) {
                document.getElementById('daily_screen_time_hours').value = exactDecimalHours;
            }
            if (extractedSocialHours > 0) {
                document.getElementById('social_media_hours').value = extractedSocialHours;
            }
            if (totalUnlocks > 0) {
                document.getElementById('unlock_frequency').value = totalUnlocks;
            }

            if (appUsageHtml !== "") {
                document.getElementById('appBreakdownList').innerHTML = appUsageHtml;
                document.getElementById('appBreakdownContainer').style.display = "block";
            }

            statusDiv.style.color = 'var(--color-green)';
            statusDiv.innerText = `SUCCESS! EXTRACTED ${exactDecimalHours} HRS TOTAL.`;
            
        } catch (err) {
            console.error(err);
            statusDiv.style.color = 'var(--color-red)';
            statusDiv.innerText = 'OCR ERROR. ENTER METRICS MANUALLY.';
        }
    }

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
                const unlockInput = document.getElementById('unlock_frequency').value;
                const unlockVal = unlockInput !== "" ? parseInt(unlockInput, 10) : 0;

                if (screenTimeVal === '' || screenTimeVal === '0') {
                    alert('Please provide your total screen time in Step 2.');
                    goToStep(2); return;
                }

                let phqTotal = 0;
                for (let i = 0; i < PHQ_QUESTIONS.length; i++) {
                    const selected = document.querySelector(`input[name="phq_q${i}"]:checked`);
                    if (!selected) {
                        alert(`Please answer Emotional Wellbeing question #${i + 1} in Step 3.`);
                        goToStep(3); return;
                    }
                    phqTotal += parseInt(selected.value, 10);
                }

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
                let result;
                try {
                    result = JSON.parse(rawText);
                } catch (parseErr) {
                    console.error("Non-JSON Response from Server:", rawText);
                    alert("Server returned an invalid response.");
                    return;
                }

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