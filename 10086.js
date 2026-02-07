// 脚本名称: 百度提现
// 描述: 自动完成百度APP的提现任务
// 作者: 元宝
// 版本: 1.0.0
// 更新时间: 2026-02-07
// 支持应用: 百度/百度极速版
// 使用说明: 需要搭配Quantumult X使用
// Quantumult X重写配置:
// [rewrite_local]
// ^https?:\/\/mbd\.baidu\.com\/(newspage\/api|activity\/api|activityflow|activity\/task) url script-request-body https://raw.githubusercontent.com/yourname/scripts/main/baidu_withdraw.js
// [task_local]
// 0 9-20 * * * https://raw.githubusercontent.com/yourname/scripts/main/baidu_withdraw.js, tag=百度提现, enabled=true

const $ = new Env('百度提现');
const notify = $.isNode ? require('./sendNotify') : '';
const isQX = typeof $task !== "undefined";

// 配置区域
let config = {
    // 基础设置
    enabled: true, // 是否启用脚本
    autoWithdraw: true, // 是否自动提现
    withdrawAmount: 0.3, // 提现金额(元)，0.3表示3毛
    minBalance: 1, // 最低提现余额(元)
    maxRetry: 3, // 失败重试次数
    
    // 通知设置
    notifySuccess: true, // 成功通知
    notifyFailure: true, // 失败通知
    notifyBalance: true, // 余额变更通知
    
    // 任务设置
    doSignIn: true, // 执行签到
    doReadNews: true, // 阅读新闻
    doWatchVideo: true, // 观看视频
    doSearch: true, // 搜索任务
    
    // 请求配置
    timeout: 10000, // 请求超时时间(ms)
    
    // 统计
    totalIncome: 0,
    todayIncome: 0,
    withdrawCount: 0
};

// 任务列表
let tasks = {
    signIn: {
        name: "签到",
        completed: false,
        income: 0
    },
    readNews: {
        name: "阅读新闻",
        completed: false,
        income: 0,
        target: 10, // 10篇文章
        current: 0
    },
    watchVideo: {
        name: "观看视频",
        completed: false,
        income: 0,
        target: 5, // 5个视频
        current: 0
    },
    search: {
        name: "搜索任务",
        completed: false,
        income: 0,
        target: 3, // 3次搜索
        current: 0
    }
};

// 用户数据
let userData = {
    balance: 0, // 当前余额
    totalWithdraw: 0, // 累计提现
    lastWithdrawTime: null, // 上次提现时间
    todayTasks: 0, // 今日完成任务数
    cookies: "", // 用户cookies
    token: "" // 用户token
};

// 主函数
async function main() {
    try {
        console.log(`\n========== 百度提现脚本开始运行 ==========`);
        console.log(`⏰ 当前时间: ${new Date().toLocaleString()}`);
        
        // 检查配置
        if (!config.enabled) {
            console.log("❌ 脚本已禁用，请在配置中启用");
            return;
        }
        
        // 初始化
        await init();
        
        // 检查登录状态
        if (!await checkLogin()) {
            console.log("❌ 未检测到有效登录，请先登录百度APP");
            sendNotify("百度提现 - 登录失效", "请重新登录百度APP");
            return;
        }
        
        // 获取用户信息
        await getUserInfo();
        
        // 执行任务
        await runTasks();
        
        // 检查提现条件
        if (config.autoWithdraw && userData.balance >= config.minBalance) {
            await doWithdraw();
        }
        
        // 生成报告
        await generateReport();
        
    } catch (error) {
        console.log(`❌ 脚本执行出错: ${error.message}`);
        if (config.notifyFailure) {
            sendNotify("百度提现 - 执行出错", error.message);
        }
    }
}

// 初始化
async function init() {
    // 尝试从持久化存储加载数据
    try {
        const savedData = $.getdata('baidu_withdraw_data');
        if (savedData) {
            const data = JSON.parse(savedData);
            userData = { ...userData, ...data };
            config = { ...config, ...data.config };
        }
    } catch (e) {
        console.log("ℹ️ 无持久化数据，使用默认配置");
    }
    
    // 获取cookies
    if (isQX) {
        userData.cookies = $request?.headers?.Cookie || "";
    } else {
        // Surge等其他环境
        userData.cookies = $persistentStore.read("baidu_cookies") || "";
    }
}

// 检查登录状态
async function checkLogin() {
    try {
        const response = await request({
            url: "https://mbd.baidu.com/newspage/api/userinfo",
            method: "GET",
            headers: {
                "Cookie": userData.cookies,
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 baiduboxapp"
            }
        });
        
        if (response && response.data && response.data.isLogin) {
            userData.token = response.data.token;
            console.log("✅ 登录状态: 已登录");
            return true;
        }
    } catch (error) {
        console.log("❌ 检查登录失败");
    }
    return false;
}

// 获取用户信息
async function getUserInfo() {
    try {
        const response = await request({
            url: "https://mbd.baidu.com/activity/api/getBalance",
            method: "GET",
            headers: {
                "Cookie": userData.cookies,
                "Authorization": `Bearer ${userData.token}`
            }
        });
        
        if (response && response.data) {
            const oldBalance = userData.balance;
            userData.balance = response.data.balance || 0;
            config.totalIncome = response.data.totalIncome || 0;
            
            console.log(`💰 当前余额: ${userData.balance}元`);
            console.log(`📊 累计收益: ${config.totalIncome}元`);
            
            // 余额变化通知
            if (config.notifyBalance && oldBalance !== userData.balance) {
                sendNotify("百度提现 - 余额更新", `当前余额: ${userData.balance}元`);
            }
        }
    } catch (error) {
        console.log("❌ 获取用户信息失败");
    }
}

// 执行所有任务
async function runTasks() {
    console.log("\n🎯 开始执行任务...");
    
    if (config.doSignIn) {
        await doSignIn();
    }
    
    if (config.doReadNews) {
        await doReadNewsTask();
    }
    
    if (config.doWatchVideo) {
        await doWatchVideoTask();
    }
    
    if (config.doSearch) {
        await doSearchTask();
    }
}

// 签到任务
async function doSignIn() {
    if (tasks.signIn.completed) {
        console.log("✅ 签到任务: 今日已完成");
        return;
    }
    
    try {
        const response = await request({
            url: "https://mbd.baidu.com/activity/api/signIn",
            method: "POST",
            headers: {
                "Cookie": userData.cookies,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "token": userData.token,
                "timestamp": Date.now()
            })
        });
        
        if (response && response.code === 0) {
            tasks.signIn.completed = true;
            tasks.signIn.income = response.data.reward || 0.1;
            config.todayIncome += tasks.signIn.income;
            userData.todayTasks++;
            
            console.log(`✅ 签到成功: +${tasks.signIn.income}元`);
        } else {
            console.log("❌ 签到失败");
        }
    } catch (error) {
        console.log("❌ 签到任务出错");
    }
}

// 阅读新闻任务
async function doReadNewsTask() {
    console.log(`📰 阅读新闻: ${tasks.readNews.current}/${tasks.readNews.target}`);
    
    for (let i = tasks.readNews.current; i < tasks.readNews.target; i++) {
        try {
            // 模拟阅读一篇新闻
            const response = await request({
                url: "https://mbd.baidu.com/activity/api/readNews",
                method: "POST",
                headers: {
                    "Cookie": userData.cookies
                },
                body: JSON.stringify({
                    "newsId": generateNewsId(),
                    "readTime": 30 // 阅读30秒
                })
            });
            
            if (response && response.code === 0) {
                tasks.readNews.current++;
                tasks.readNews.income += response.data.reward || 0.01;
                config.todayIncome += response.data.reward || 0.01;
                
                console.log(`  第${i + 1}篇: +${response.data.reward || 0.01}元`);
                
                // 随机延迟，避免请求过快
                await sleep(random(1000, 3000));
            }
        } catch (error) {
            console.log(`  第${i + 1}篇: 阅读失败`);
        }
    }
    
    if (tasks.readNews.current >= tasks.readNews.target) {
        tasks.readNews.completed = true;
        userData.todayTasks++;
        console.log(`✅ 阅读新闻完成: 总计+${tasks.readNews.income.toFixed(2)}元`);
    }
}

// 观看视频任务
async function doWatchVideoTask() {
    console.log(`🎬 观看视频: ${tasks.watchVideo.current}/${tasks.watchVideo.target}`);
    
    for (let i = tasks.watchVideo.current; i < tasks.watchVideo.target; i++) {
        try {
            const response = await request({
                url: "https://mbd.baidu.com/activity/api/watchVideo",
                method: "POST",
                headers: {
                    "Cookie": userData.cookies
                },
                body: JSON.stringify({
                    "videoId": generateVideoId(),
                    "watchTime": 60 // 观看60秒
                })
            });
            
            if (response && response.code === 0) {
                tasks.watchVideo.current++;
                tasks.watchVideo.income += response.data.reward || 0.02;
                config.todayIncome += response.data.reward || 0.02;
                
                console.log(`  第${i + 1}个视频: +${response.data.reward || 0.02}元`);
                await sleep(random(2000, 5000));
            }
        } catch (error) {
            console.log(`  第${i + 1}个视频: 观看失败`);
        }
    }
    
    if (tasks.watchVideo.current >= tasks.watchVideo.target) {
        tasks.watchVideo.completed = true;
        userData.todayTasks++;
        console.log(`✅ 观看视频完成: 总计+${tasks.watchVideo.income.toFixed(2)}元`);
    }
}

// 搜索任务
async function doSearchTask() {
    console.log(`🔍 搜索任务: ${tasks.search.current}/${tasks.search.target}`);
    
    const keywords = ["今日热点", "天气预报", "新闻资讯", "科技动态", "娱乐新闻"];
    
    for (let i = tasks.search.current; i < tasks.search.target; i++) {
        try {
            const keyword = keywords[i % keywords.length];
            const response = await request({
                url: "https://mbd.baidu.com/activity/api/search",
                method: "POST",
                headers: {
                    "Cookie": userData.cookies
                },
                body: JSON.stringify({
                    "keyword": keyword,
                    "timestamp": Date.now()
                })
            });
            
            if (response && response.code === 0) {
                tasks.search.current++;
                tasks.search.income += response.data.reward || 0.03;
                config.todayIncome += response.data.reward || 0.03;
                
                console.log(`  搜索"${keyword}": +${response.data.reward || 0.03}元`);
                await sleep(random(1500, 3000));
            }
        } catch (error) {
            console.log(`  第${i + 1}次搜索: 失败`);
        }
    }
    
    if (tasks.search.current >= tasks.search.target) {
        tasks.search.completed = true;
        userData.todayTasks++;
        console.log(`✅ 搜索任务完成: 总计+${tasks.search.income.toFixed(2)}元`);
    }
}

// 执行提现
async function doWithdraw() {
    console.log("\n💸 检查提现条件...");
    console.log(`   当前余额: ${userData.balance}元`);
    console.log(`   最低提现: ${config.minBalance}元`);
    console.log(`   目标金额: ${config.withdrawAmount}元`);
    
    if (userData.balance < config.withdrawAmount) {
        console.log(`❌ 余额不足，无法提现`);
        return;
    }
    
    // 检查是否已提现过
    const today = new Date().toDateString();
    if (userData.lastWithdrawTime === today) {
        console.log("ℹ️ 今日已提现，跳过");
        return;
    }
    
    console.log("🚀 开始提现...");
    
    let retry = 0;
    while (retry < config.maxRetry) {
        try {
            const response = await request({
                url: "https://mbd.baidu.com/activity/api/withdraw",
                method: "POST",
                headers: {
                    "Cookie": userData.cookies,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "amount": config.withdrawAmount,
                    "type": "wechat", // 微信提现
                    "token": userData.token
                })
            });
            
            if (response && response.code === 0) {
                userData.balance -= config.withdrawAmount;
                config.totalIncome += config.withdrawAmount;
                userData.totalWithdraw += config.withdrawAmount;
                userData.lastWithdrawTime = today;
                config.withdrawCount++;
                
                console.log(`✅ 提现成功: ${config.withdrawAmount}元`);
                console.log(`   剩余余额: ${userData.balance}元`);
                console.log(`   累计提现: ${userData.totalWithdraw}元`);
                
                if (config.notifySuccess) {
                    sendNotify(
                        "百度提现 - 提现成功",
                        `提现金额: ${config.withdrawAmount}元\n剩余余额: ${userData.balance}元\n累计提现: ${userData.totalWithdraw}元`
                    );
                }
                
                // 保存数据
                saveData();
                break;
            } else {
                console.log(`❌ 提现失败: ${response?.msg || "未知错误"}`);
                retry++;
            }
        } catch (error) {
            console.log(`❌ 提现请求失败: ${error.message}`);
            retry++;
        }
        
        if (retry < config.maxRetry) {
            console.log(`⏱️ 等待重试... (${retry}/${config.maxRetry})`);
            await sleep(3000);
        }
    }
    
    if (retry >= config.maxRetry) {
        console.log("❌ 提现失败，已达最大重试次数");
        if (config.notifyFailure) {
            sendNotify("百度提现 - 提现失败", "提现失败，请手动操作");
        }
    }
}

// 生成报告
async function generateReport() {
    console.log("\n📊 ========== 任务报告 ==========");
    console.log(`📅 日期: ${new Date().toLocaleDateString()}`);
    console.log(`💰 当前余额: ${userData.balance.toFixed(2)}元`);
    console.log(`📈 今日收益: ${config.todayIncome.toFixed(2)}元`);
    console.log(`🏦 累计收益: ${config.totalIncome.toFixed(2)}元`);
    console.log(`💸 累计提现: ${userData.totalWithdraw.toFixed(2)}元`);
    console.log(`✅ 完成任务: ${userData.todayTasks}/4个`);
    
    // 任务详情
    console.log("\n📋 任务详情:");
    console.log(`   ${tasks.signIn.completed ? '✅' : '❌'} ${tasks.signIn.name}: +${tasks.signIn.income.toFixed(2)}元`);
    console.log(`   ${tasks.readNews.completed ? '✅' : '❌'} ${tasks.readNews.name}: +${tasks.readNews.income.toFixed(2)}元 (${tasks.readNews.current}/${tasks.readNews.target})`);
    console.log(`   ${tasks.watchVideo.completed ? '✅' : '❌'} ${tasks.watchVideo.name}: +${tasks.watchVideo.income.toFixed(2)}元 (${tasks.watchVideo.current}/${tasks.watchVideo.target})`);
    console.log(`   ${tasks.search.completed ? '✅' : '❌'} ${tasks.search.name}: +${tasks.search.income.toFixed(2)}元 (${tasks.search.current}/${tasks.search.target})`);
    
    console.log("=================================\n");
    
    // 发送通知
    if (config.notifySuccess && config.todayIncome > 0) {
        const message = 
            `💰 当前余额: ${userData.balance.toFixed(2)}元\n` +
            `📈 今日收益: ${config.todayIncome.toFixed(2)}元\n` +
            `✅ 完成任务: ${userData.todayTasks}/4个\n` +
            `🏦 累计提现: ${userData.totalWithdraw.toFixed(2)}元`;
        
        sendNotify("百度提现 - 任务完成", message);
    }
    
    // 保存数据
    saveData();
}

// 保存数据到持久化存储
function saveData() {
    const saveData = {
        ...userData,
        config: config,
        tasks: tasks,
        lastRun: new Date().toISOString()
    };
    
    $.setdata(JSON.stringify(saveData), 'baidu_withdraw_data');
    console.log("💾 数据已保存");
}

// HTTP请求封装
function request(options) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const requestOptions = {
            url: options.url,
            method: options.method || "GET",
            headers: options.headers || {},
            timeout: config.timeout
        };
        
        if (options.body) {
            requestOptions.body = options.body;
        }
        
        if (isQX) {
            // Quantumult X
            $task.fetch(requestOptions).then(response => {
                try {
                    const data = JSON.parse(response.body);
                    const endTime = Date.now();
                    console.log(`🔗 ${options.method || "GET"} ${options.url} (${endTime - startTime}ms)`);
                    resolve(data);
                } catch (e) {
                    reject(new Error("解析响应失败"));
                }
            }, reject);
        } else {
            // Surge等其他环境
            $httpClient.post(requestOptions, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    try {
                        const data = JSON.parse(body);
                        const endTime = Date.now();
                        console.log(`🔗 ${options.method || "GET"} ${options.url} (${endTime - startTime}ms)`);
                        resolve(data);
                    } catch (e) {
                        reject(new Error("解析响应失败"));
                    }
                }
            });
        }
    });
}

// 发送通知
function sendNotify(title, message) {
    if (isQX) {
        $notify(title, "", message);
    } else if ($.isNode) {
        notify.sendNotify(`${title}`, message);
    } else {
        $notification.post(title, "", message);
    }
    console.log(`📢 发送通知: ${title}`);
}

// 工具函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateNewsId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function generateVideoId() {
    return "video_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// 执行主函数
main().catch(console.error);

// 环境判断
function Env(name) {
    this.name = name;
    this.isNode = typeof process !== "undefined" && process.version;
    this.isQX = typeof $task !== "undefined";
    this.isSurge = typeof $httpClient !== "undefined" && !this.isQX;
    
    this.getdata = (key) => {
        if (this.isQX || this.isSurge) {
            return $persistentStore.read(key);
        }
        if (this.isNode) {
            // Node.js环境实现
            return process.env[key] || null;
        }
        return null;
    };
    
    this.setdata = (val, key) => {
        if (this.isQX || this.isSurge) {
            return $persistentStore.write(val, key);
        }
        if (this.isNode) {
            // Node.js环境实现
            process.env[key] = val;
            return true;
        }
        return false;
    };
}
