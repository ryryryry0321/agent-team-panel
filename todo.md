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
  - READMEをまともに書く ここを盛り込む (英語, agents decects automaticallyは特徴としていれる, CI/CDラベルもつける, アプリケーションの使用法,  動作保証はMacOSのみ,Quickスタート,ローカルセットアップ )
  - tmux環境前提でインストールできる仕組みを作る
     - install.shを見直す。あとインストール経由だとバグる
```
[main] creating session ctp-main-008e9f
[main] attaching pty to session ctp-main-008e9f
[main] posix_spawnp failed.
```

Phase3 
- リリースTag付
- new version通知
- dmg配布
- なんか便利機能追加(みんなのフィードバックもらう)

