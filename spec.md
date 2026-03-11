# 宠物行为与动画逻辑优化规划

## 1. 现状分析 (Current Analysis)

通过代码分析，当前宠物动画与交互逻辑存在以下主要问题，导致用户感觉“缺乏逻辑”：

1.  **状态定义不纯粹，移动逻辑分离**：
    *   当前状态机 (`PET_STATES`) 仅包含 `IDLE`、`INTERACT`、`REST` 等静态状态。
    *   “移动” (`petWalk.isWalking`) 是一个独立于状态机之外的标志位。这导致宠物可以在 `REST` (睡觉) 状态下被代码强制移动，或者在移动过程中状态被意外重置。
2.  **缺乏“行走”动画，视觉像“滑行”**：
    *   在 `walkPetAlongPath` 函数中，宠物移动时强制播放 `idle_breath` (呼吸) 动画。
    *   虽然添加了 `pet-anim-walk` CSS 类，但本质上宠物是在“站立呼吸”的状态下平移，视觉上像是在溜冰或滑行，缺乏真实感。
3.  **路径与位置逻辑僵硬**：
    *   `buildPathToHotspot` 返回的是硬编码的坐标点。
    *   如果宠物当前不在路径起点，它会直接从当前位置直线滑向第一个路径点，这可能导致穿墙或奇怪的移动轨迹。
4.  **状态切换生硬，缺乏过渡**：
    *   例如从“站立”到“睡觉”，是直接切换图片，没有“走到床边 -> 转身 -> 躺下”的连贯动作。
    *   打断机制粗暴：新的 `setPetState` 会立即清除所有计时器和移动，导致动作瞬间截断。

## 2. 优化目标 (Goals)

1.  **逻辑自洽**：移动本身应作为一个独立状态 (`MOVING`)，移动时必须播放移动动画。
2.  **动作连贯**：引入“行为链 (Behavior Chain)”概念，支持 `思考 -> 移动 -> 交互 -> 结算状态` 的序列化执行。
3.  **视觉自然**：优化移动时的朝向（左右翻转）和动画帧率，使其看起来更像是在走动。
4.  **资源一致**：参考提供的 GIF 动画效果，校准各状态的动画表现。

### 2.1 动画资源参考 (Animation Reference)
根据 `/Users/silas/Desktop/parttime/soulgo/比卡丘动画导出` 目录下的 GIF 演示，明确各状态的预期表现：

*   **`互动演示.gif`** -> **INTERACT (interact)**: 对应 `PET_STATES.INTERACT`，表现为大幅度的肢体动作（如跳跃、招手），用于用户点击或完成任务时的反馈。
*   **`休息演示.gif`** -> **REST (rest)**: 对应 `PET_STATES.REST`，表现为闭眼、趴下或蜷缩，用于睡眠状态。
*   **`呼吸演示.gif`** -> **IDLE_BREATH (idle_breath)**: 对应 `PET_STATES.IDLE_BREATH`，表现为轻微的身体起伏，用于默认待机状态。
*   **`等待演示.gif`** -> **IDLE_WAIT (idle_wait)**: 对应 `PET_STATES.IDLE_WAIT`，表现为伸懒腰或四处张望，用于“让 AI 帮它想想”的思考期间或准备出发前。
*   **`观察演示.gif`** -> **IDLE_OBSERVE (idle_observe)**: 对应 `PET_STATES.IDLE_OBSERVE`，表现为专注凝视某个方向，用于观察橱柜、门口等热点。
*   **`吃演示.gif`** -> **EAT (eat)**: 吃食动作，可用于喂食等交互。
*   **`摸演示.gif`** -> **PET/TOUCH (摸)**: 被抚摸时的反应动画。

**注**：实际代码实现中，应调整 CSS Spritesheet 的播放逻辑（帧率、循环方式），以尽可能还原上述 GIF 的流畅度与神态。

## 3. 技术方案 (Technical Proposal)

### 3.1 状态机重构
在 `PET_STATES` 中显式增加 `MOVING` 状态。

```javascript
const PET_STATES = {
    IDLE_WAIT: 'idle_wait',
    IDLE_BREATH: 'idle_breath',
    IDLE_OBSERVE: 'idle_observe',
    INTERACT: 'interact',
    REST: 'rest',
    MOVING: 'moving' // 新增：移动中
};
```

### 3.2 引入“行为序列” (Behavior Sequence)
封装一个异步的 `runBehaviorSequence` 函数，取代零散的 `setTimeout` 回调地狱。

**伪代码示例：**
```javascript
// 定义一个去睡觉的行为链
const sleepSequence = [
    { type: 'emote', value: 'thinking', duration: 1000 }, // 思考气泡
    { type: 'walk', target: 'bed' },                      // 走到床
    { type: 'anim', value: 'interact', duration: 500 },   // 到达后跳一下/伸懒腰
    { type: 'state', value: 'rest' }                      // 进入休息状态
];

async function executeSequence(seq) {
    for (const action of seq) {
        if (action.type === 'walk') await walkTo(action.target);
        else if (action.type === 'wait') await delay(action.duration);
        else if (action.type === 'state') setPetState(action.value);
        // ...
    }
}
```

### 3.3 移动逻辑优化 (`walkPetAlongPath` 重构)
1.  **动态起点**：路径规划应始终以“宠物当前位置”为起点 (Start Point)，连接到目标路径的最近点或第一点。
2.  **行走动画**：
    *   如果没有专门的 `walk` 帧动画，可以使用 `interact` (通常幅度较大) 或加快 `idle_breath` 的帧率来模拟行走。
    *   添加 `flip` 逻辑：根据目标点在当前点的左边还是右边，自动设置 CSS `transform: scaleX(-1)`，确保宠物朝向正确。

### 3.4 交互打断优化
*   **锁机制**：在执行关键行为链（如“去睡觉”）时，设置 `isBusy` 锁。
*   除非用户进行高优先级操作（如“抚摸”、“强制唤醒”），否则自动闲置逻辑 (`inactivityTimer`) 不应打断当前行为。

## 4. 实施步骤
1.  **重构 `setPetState`**：支持 `MOVING` 状态，处理好状态进入/退出的清理逻辑。
2.  **改造 `walkPetAlongPath`**：
    *   返回 `Promise` 以支持 `await`。
    *   增加朝向判断。
    *   移动期间播放更合适的动画（如高频呼吸或交互帧）。
3.  **实现 `applyBehaviorDecision` 的序列化**：将原本的嵌套回调改为 `async/await` 结构。
4.  **测试**：验证“让 AI 帮它想想”触发的各种行为是否流畅。
