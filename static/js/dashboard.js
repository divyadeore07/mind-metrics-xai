/**
 * static/js/dashboard.js
 * Clean, Mobile-Responsive Dashboard & Charts
 */

document.addEventListener("DOMContentLoaded", () => {
    try {
        const rawData = sessionStorage.getItem("last_result");
        
        if (!rawData) {
            alert("No assessment data found. Please complete the assessment first.");
            window.location.href = "/assessment";
            return;
        }

        const result = JSON.parse(rawData);
        const analytics = result.analytics || {};
        const insight = result.combined_insight || {};
        const shap = result.shap_explanation || [];

        // 1. Populate Header
        const riskEl = document.getElementById("overall-risk");
        if (riskEl) {
            riskEl.innerText = (insight.risk_level || "UNKNOWN").toUpperCase();
            if ((insight.risk_level || "").includes("High")) {
                riskEl.style.color = "var(--color-terracotta)";
            } else if ((insight.risk_level || "").includes("Moderate")) {
                riskEl.style.color = "var(--color-yellow)";
            } else {
                riskEl.style.color = "var(--color-green)";
            }
        }

        const probEl = document.getElementById("overall-prob");
        if (probEl) {
            probEl.innerText = (insight.risk_probability || "0") + "%";
        }

        // 2. Metrics
        if (analytics.usage) {
            const usageTotal = document.getElementById("usage-total");
            if (usageTotal) usageTotal.innerText = analytics.usage.screen_time || "0";

            const usageSocial = document.getElementById("usage-social");
            if (usageSocial) usageSocial.innerText = analytics.usage.social_media || "0";

            const usageSleep = document.getElementById("usage-sleep");
            if (usageSleep) usageSleep.innerText = analytics.usage.sleep || "0";

            const usageUnlocks = document.getElementById("usage-unlocks");
            if (usageUnlocks) usageUnlocks.innerText = analytics.usage.unlocks || "0";
        }

        if (analytics.sas) {
            const sasScore = document.getElementById("sas-score");
            if (sasScore) sasScore.innerText = analytics.sas.score || "0";
            
            const sasSeverity = document.getElementById("sas-severity");
            if (sasSeverity) sasSeverity.innerText = analytics.sas.severity || "Evaluated";
        }
        
        if (analytics.phq) {
            const phqScore = document.getElementById("phq-score");
            if (phqScore) phqScore.innerText = analytics.phq.score || "0";
            
            const phqSeverity = document.getElementById("phq-severity");
            if (phqSeverity) phqSeverity.innerText = analytics.phq.severity || "Evaluated";
        }

        // 3. Action Plan List
        const recsList = document.getElementById("recommendationsList");
        if (recsList) {
            recsList.innerHTML = "";
            if (insight.recommendations && insight.recommendations.length > 0) {
                insight.recommendations.forEach(rec => {
                    const li = document.createElement("li");
                    li.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-green);"></i> <span>${rec}</span>`;
                    recsList.appendChild(li);
                });
            }
        }

        // 4. Easy-to-read Red Flags
        const flagsSection = document.getElementById("behavioral-flags");
        if (flagsSection) {
            const flagsContainer = flagsSection.querySelector("ul") || flagsSection;
            flagsContainer.innerHTML = "";
            let flagsAdded = false;

            if (analytics.usage && analytics.usage.screen_time > 5) {
                flagsContainer.innerHTML += `<li><i class="fa-solid fa-triangle-exclamation" style="color: var(--color-terracotta);"></i> <div><strong>High Screen Time:</strong> Your daily usage is higher than recommended.</div></li>`;
                flagsAdded = true;
            }
            if (analytics.usage && analytics.usage.sleep < 6) {
                flagsContainer.innerHTML += `<li><i class="fa-solid fa-bed" style="color: var(--color-terracotta);"></i> <div><strong>Low Sleep:</strong> You are getting less sleep than your body likely needs.</div></li>`;
                flagsAdded = true;
            }
            if (analytics.sas && analytics.sas.score >= 31) {
                flagsContainer.innerHTML += `<li><i class="fa-solid fa-link-slash" style="color: var(--color-terracotta);"></i> <div><strong>High Attachment:</strong> You show signs of strongly relying on your phone.</div></li>`;
                flagsAdded = true;
            }
            
            if (!flagsAdded) {
                flagsContainer.innerHTML = `<li><i class="fa-solid fa-shield-check" style="color: var(--color-green);"></i> <div><strong>Healthy Habits:</strong> We didn't detect any major areas of concern!</div></li>`;
            }
        }

        const computedTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#2D3748';

        // Helper dictionary to make SHAP labels human-readable
        const readableFeatures = {
            "daily_screen_time_hours": "Total Screen Time",
            "social_media_hours": "Social Media Usage",
            "sleep_hours": "Sleep Duration",
            "unlock_frequency": "Phone Unlocks",
            "sas_sv_score": "Attachment Score",
            "phq9_score": "Mood Score"
        };

        // 5. SHAP Chart Render
        if (shap && shap.length > 0) {
            const riskDrivers = shap.filter(item => item.impact > 0).sort((a, b) => b.impact - a.impact);
            
            const labels = riskDrivers.map(item => {
                return readableFeatures[item.feature] || item.feature.replace(/_/g, " ");
            });
            
            const impacts = riskDrivers.map(item => item.impact);
            
            const canvas = document.getElementById("brutalHorizontalChart");
            if (canvas) {
                new Chart(canvas.getContext("2d"), {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: impacts,
                            backgroundColor: '#D97D6C',
                            borderRadius: 6,
                            barThickness: 14            
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { grid: { color: 'rgba(150,150,150,0.1)' }, ticks: { display: false } },
                            y: { grid: { display: false }, ticks: { font: { weight: '600', size: 11, family: 'Inter' }, color: computedTextColor } }
                        }
                    }
                });
            }
        }

        // 6. Timeline Chart Render
        fetch('/api/user/history')
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success' && data.history.dates.length > 0) {
                    const hist = data.history;
                    const lineCanvas = document.getElementById("historyLineChart");
                    
                    if (lineCanvas) {
                        new Chart(lineCanvas.getContext("2d"), {
                            type: 'line',
                            data: {
                                labels: hist.dates,
                                datasets: [
                                    {
                                        label: 'Screen Time (Hrs)',
                                        data: hist.screen_time,
                                        borderColor: '#738290',
                                        backgroundColor: '#738290',
                                        borderWidth: 2,
                                        tension: 0.3,
                                        pointRadius: 4
                                    },
                                    {
                                        label: 'Mood Score',
                                        data: hist.phq9,
                                        borderColor: '#8AA38C',
                                        backgroundColor: '#8AA38C',
                                        borderWidth: 2,
                                        tension: 0.3,
                                        pointRadius: 4
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { labels: { font: { family: 'Inter', weight: '600', size: 12 }, color: computedTextColor } }
                                },
                                scales: {
                                    x: { grid: { color: 'rgba(150,150,150,0.1)' }, ticks: { font: { size: 11, family: 'Inter' }, color: computedTextColor } },
                                    y: { grid: { color: 'rgba(150,150,150,0.1)' }, ticks: { font: { size: 11, family: 'Inter' }, color: computedTextColor } }
                                }
                            }
                        });
                    }
                }
            })
            .catch(err => console.error("History Error:", err));

        // 7. Exporters
        document.getElementById("exportDataBtn")?.addEventListener("click", () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 4));
            const node = document.createElement('a');
            node.setAttribute("href", dataStr);
            node.setAttribute("download", "wellness_report.json");
            document.body.appendChild(node);
            node.click();
            node.remove();
        });

        document.getElementById("exportPdfBtn")?.addEventListener("click", () => {
            const element = document.querySelector(".command-center-container");
            const btn = document.getElementById("exportPdfBtn");
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            html2pdf().from(element).set({ margin: [10, 5, 10, 5], filename: 'Mind_Metrics_Report.pdf', image: { type: 'jpeg', quality: 0.98 } }).save().then(() => {
                btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> SAVE REPORT';
            });
        });

    } catch (error) {
        console.error("Dashboard Rendering Error:", error);
    } finally {
        document.querySelectorAll('.scroll-reveal').forEach(el => {
            el.style.opacity = 1;
            el.style.transform = "translateY(0)";
        });
    }
});