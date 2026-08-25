/**
 * static/js/dashboard.js
 * Clean, Skimmable Command Center Dashboard & Charts
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

        // 1. Populate Hero Verdict
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

        // 2. Telemetry Metrics (Safe element checking)
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

        // 3. Clinical Metrics
        if (analytics.sas) {
            const sasScore = document.getElementById("sas-score");
            if (sasScore) sasScore.innerText = analytics.sas.score || "0";
            
            const sasSeverity = document.getElementById("sas-severity");
            if (sasSeverity) sasSeverity.innerText = analytics.sas.severity || "Evaluated";
        }
        
        if (analytics.phq) {
            const phqScore = document.getElementById("phq-score");
            if (phqScore) phqScore.innerText = analytics.phq.score || "0";
        }

        // 4. Action Plan List
        const recsList = document.getElementById("recommendationsList");
        if (recsList) {
            recsList.innerHTML = "";
            if (insight.recommendations && insight.recommendations.length > 0) {
                insight.recommendations.forEach(rec => {
                    const li = document.createElement("li");
                    li.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-green); margin-top: 3px;"></i> <span>${rec}</span>`;
                    recsList.appendChild(li);
                });
            }
        }

        // 5. Red Flags
        const flagsSection = document.getElementById("behavioral-flags");
        if (flagsSection) {
            const flagsContainer = flagsSection.querySelector("ul") || flagsSection;
            flagsContainer.innerHTML = "";
            let flagsAdded = false;

            if (analytics.usage && analytics.usage.screen_time > 5) {
                flagsContainer.innerHTML += `<li><i class="fa-solid fa-triangle-exclamation" style="color: var(--color-terracotta);"></i> <div><strong>High Screen Time:</strong> Daily usage exceeds healthy thresholds.</div></li>`;
                flagsAdded = true;
            }
            if (analytics.usage && analytics.usage.sleep < 6) {
                flagsContainer.innerHTML += `<li><i class="fa-solid fa-bed" style="color: var(--color-terracotta);"></i> <div><strong>Sleep Deprivation:</strong> Rest schedule is below normal baseline.</div></li>`;
                flagsAdded = true;
            }
            if (analytics.sas && analytics.sas.score >= 31) {
                flagsContainer.innerHTML += `<li><i class="fa-solid fa-triangle-exclamation" style="color: var(--color-terracotta);"></i> <div><strong>Dependency Risk:</strong> High compulsive checking tendency.</div></li>`;
                flagsAdded = true;
            }
            
            if (!flagsAdded) {
                flagsContainer.innerHTML = `<li><i class="fa-solid fa-shield-check" style="color: var(--color-green);"></i> <div><strong>Clean Habits:</strong> No severe behavioral red flags found.</div></li>`;
            }
        }

        const computedTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#2D3748';

        // 6. SHAP Chart Render
        if (shap && shap.length > 0) {
            const riskDrivers = shap.filter(item => item.impact > 0).sort((a, b) => b.impact - a.impact);
            const labels = riskDrivers.map(item => item.feature.replace(/_/g, " ").toUpperCase());
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
                            y: { grid: { display: false }, ticks: { font: { weight: '600', size: 10 }, color: computedTextColor } }
                        }
                    }
                });
            }
        }

        // 7. Timeline Chart Render
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
                                        borderWidth: 2,
                                        tension: 0.3,
                                        pointRadius: 3
                                    },
                                    {
                                        label: 'PHQ-9 Score',
                                        data: hist.phq9,
                                        borderColor: '#8AA38C',
                                        borderWidth: 2,
                                        tension: 0.3,
                                        pointRadius: 3
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { labels: { font: { family: 'Inter', weight: '600', size: 11 }, color: computedTextColor } }
                                },
                                scales: {
                                    x: { grid: { color: 'rgba(150,150,150,0.1)' }, ticks: { font: { size: 10 }, color: computedTextColor } },
                                    y: { grid: { color: 'rgba(150,150,150,0.1)' }, ticks: { font: { size: 10 }, color: computedTextColor } }
                                }
                            }
                        });
                    }
                }
            })
            .catch(err => console.error("History Error:", err));

        // 8. Exporters
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
            html2pdf().from(element).set({ margin: 5, filename: 'Command_Center_Report.pdf', image: { type: 'jpeg', quality: 0.98 } }).save().then(() => {
                btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> PDF';
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