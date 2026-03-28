# Phase1 やること
- 1.冗長そうなmain.tsのコードをもっと削る（挙動は変えない）
- 2.やる処理に応じてファイルやディレクトリを分ける
- 3.Mainパネル、SideのAgentパネルのビュー崩れ
    - すべての個別SessionごとにClaudeCodeのビューを綺麗に表示したい
    - AgentTeam起動時のイメージ (agentたちはグリッドビューのように並んでる)
     | メインビューClaudeCode | |  Codex-Agent | ClaudeEngineer | etc.. 

- 1~3まで実装完了
- 4. ClaudeCode自体の再起動ボタン、停止ボタンをつける
    tmuxのkill？なのかもしれないけど
## Phase2 やることが終わったら
- OSS化
  - メンテできるコードにする
  - tmux環境前提でインストールできる仕組みを作る

## Phase3 OSS化が終わったら
- 自分の環境でカスタムフォントやカラーを入れてエヴァ風の画面にする
- 拡張プレファレンスを入れる