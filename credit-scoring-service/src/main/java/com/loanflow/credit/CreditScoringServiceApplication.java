package com.loanflow.credit;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.loanflow")
public class CreditScoringServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(CreditScoringServiceApplication.class, args);
    }
}
